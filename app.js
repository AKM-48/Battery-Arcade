/* Battery Arcade — interactive educational demonstration. */
'use strict';

const canvas = document.getElementById('sceneCanvas');
const ctx = canvas.getContext('2d', { alpha: false });
ctx.imageSmoothingEnabled = false;

const el = {
  panel: document.getElementById('experimentPanel'),
  sceneLabel: document.getElementById('sceneLabel'),
  sceneCaption: document.getElementById('sceneCaption'),
  monitorTitle: document.getElementById('monitorTitle'),
  energyPath: document.getElementById('energyPath'),
  statusBadge: document.getElementById('statusBadge'),
  batteryPercent: document.getElementById('batteryPercent'),
  batteryTrack: document.getElementById('batteryTrack'),
  batteryFill: document.getElementById('batteryFill'),
  stateExplanation: document.getElementById('stateExplanation'),
  classValue: document.getElementById('classValue'),
  processValue: document.getElementById('processValue'),
  controls: document.getElementById('controls'),
  microNote: document.getElementById('microNote'),
  oxidationText: document.getElementById('oxidationText'),
  reductionText: document.getElementById('reductionText'),
  takeawayText: document.getElementById('takeawayText'),
  equationContext: document.getElementById('equationContext'),
  equationOx: document.getElementById('equationOx'),
  equationRed: document.getElementById('equationRed'),
  equationFootnote: document.getElementById('equationFootnote'),
  presentButton: document.getElementById('presentButton')
};

function initTorch() { return { charge: 76, on: false, replacements: 0 }; }
function initCar() { return { charge: 75, engine: false, cranking: false, rev: false, lights: false, starts: 0 }; }
function initController() { return { charge: 66, playing: false, rumble: false, plugged: false }; }
let data = { torch: initTorch(), car: initCar(), controller: initController() };
let active = 'torch';
let previousTime = performance.now();
let drawTime = 0;
let lastStateKey = '';
let pendingStart = null;

const chemistry = {
  torch: {
    ox: 'Zn + 2OH⁻ → ZnO + H₂O + 2e⁻',
    red: '2MnO₂ + H₂O + 2e⁻ → Mn₂O₃ + 2OH⁻',
    context: 'Simplified alkaline zinc–manganese dioxide reactions during discharge.',
    footnote: 'The alkaline cell is not intended to be recharged. The overall simplified reaction is Zn + 2MnO₂ → ZnO + Mn₂O₃.'
  },
  carDischarge: {
    ox: 'Pb + SO₄²⁻ → PbSO₄ + 2e⁻',
    red: 'PbO₂ + 4H⁺ + SO₄²⁻ + 2e⁻ → PbSO₄ + 2H₂O',
    context: 'Lead-acid cell supplying electricity, such as when operating the starter motor.',
    footnote: 'Lead sulfate forms on both plates. Sulfuric acid concentration falls as the cell discharges.'
  },
  carCharge: {
    ox: 'PbSO₄ + 2H₂O → PbO₂ + 4H⁺ + SO₄²⁻ + 2e⁻',
    red: 'PbSO₄ + 2e⁻ → Pb + SO₄²⁻',
    context: 'External electrical energy reverses the lead-acid reactions. Electrode roles reverse during charging.',
    footnote: 'The positive plate is the charging anode; the negative plate is the charging cathode. Sulfuric acid concentration increases.'
  },
  controllerDischarge: {
    ox: 'LiC₆ → C₆ + Li⁺ + e⁻',
    red: 'CoO₂ + Li⁺ + e⁻ → LiCoO₂',
    context: 'Idealized graphite / lithium cobalt oxide (LCO) cell during discharge.',
    footnote: 'Li⁺ moves through the electrolyte. Electrons move through the external circuit and the controller.'
  },
  controllerCharge: {
    ox: 'LiCoO₂ → CoO₂ + Li⁺ + e⁻',
    red: 'C₆ + Li⁺ + e⁻ → LiC₆',
    context: 'Idealized LCO / graphite cell during charging: the external supply reverses the reactions.',
    footnote: 'Li⁺ returns to graphite. This example represents one lithium-ion chemistry, not all lithium-ion cells.'
  }
};

function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
function activeData() { return data[active]; }
function roundedCharge() { return Math.round(activeData().charge); }

const sceneDescriptions = {
  torch: 'A pixel-art flashlight powered by a replaceable alkaline battery. The lamp brightens when switched on.',
  car: 'A beige and red-striped pixel-art Nissan Patrol Y61, showing a lead-acid battery, starter and alternator functions.',
  controller: 'A pixel-art gaming controller with a lithium-ion battery that can be used and recharged.'
};

function selectScene(scene) {
  if (!Object.prototype.hasOwnProperty.call(data, scene)) return;
  active = scene;
  document.querySelectorAll('.mode-tab').forEach(tab => {
    const chosen = tab.dataset.scene === scene;
    tab.classList.toggle('is-active', chosen);
    tab.setAttribute('aria-selected', String(chosen));
    tab.tabIndex = chosen ? 0 : -1;
  });
  el.panel.setAttribute('aria-labelledby', 'tab-' + scene);
  canvas.setAttribute('aria-label', sceneDescriptions[scene]);
  document.getElementById('equationDetails').open = false;
  lastStateKey = '';
  buildControls();
  updateDisplay();
}

document.querySelectorAll('.mode-tab').forEach(tab => tab.addEventListener('click', () => selectScene(tab.dataset.scene)));
document.querySelector('.mode-tabs').addEventListener('keydown', (ev) => {
  const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
  if (!keys.includes(ev.key)) return;
  ev.preventDefault();
  const names = ['torch','car','controller'];
  const i = names.indexOf(active);
  const to = ev.key === 'Home' ? 0 : ev.key === 'End' ? 2 : (i + (ev.key === 'ArrowRight' ? 1 : 2)) % 3;
  selectScene(names[to]);
  document.getElementById('tab-' + names[to]).focus();
});

el.presentButton.addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
    else el.microNote.textContent = 'Fullscreen is not supported here. Use your browser fullscreen shortcut.';
  } catch {
    el.microNote.textContent = 'Fullscreen is blocked in this browser. Use the browser fullscreen shortcut.';
  }
});
document.addEventListener('fullscreenchange', () => { el.presentButton.title = document.fullscreenElement ? 'Exit presentation fullscreen' : 'Enter presentation fullscreen'; });

function command(action) {
  const d = activeData();
  if (action === 'reset') {
    if (active === 'car' && pendingStart !== null) { clearTimeout(pendingStart); pendingStart = null; }
    data[active] = active === 'torch' ? initTorch() : active === 'car' ? initCar() : initController();
  } else if (active === 'torch') {
    if (action === 'switch') { if (d.charge > 0) d.on = !d.on; }
    if (action === 'fast') { d.charge = 0; d.on = false; }
    if (action === 'replace') { if (d.charge <= 0) { d.charge = 100; d.on = false; d.replacements += 1; } }
  } else if (active === 'car') {
    if (action === 'engine') {
      if (d.engine) { d.engine = false; d.rev = false; }
      else if (!d.cranking && d.charge >= 13) {
        d.cranking = true;
        d.charge = clamp(d.charge - 7, 0, 100); // deliberately exaggerated for demonstration
        d.starts += 1;
        pendingStart = setTimeout(() => {
          d.cranking = false;
          d.engine = true;
          pendingStart = null;
          if (active === 'car') { buildControls(); updateDisplay(); }
        }, 800);
      }
    }
    if (action === 'rev' && d.engine) d.rev = !d.rev;
    if (action === 'lights') d.lights = !d.lights;
  } else if (active === 'controller') {
    if (action === 'play' && (d.charge > 0 || d.plugged)) d.playing = !d.playing;
    if (action === 'plug') d.plugged = !d.plugged;
    if (action === 'rumble') d.rumble = !d.rumble;
  }
  lastStateKey = '';
  buildControls();
  updateDisplay();
}

function makeButton(label, action, options = {}) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'control-btn' + (options.primary ? ' primary' : '') + (options.active ? ' active' : '') + (options.danger ? ' danger' : '') + (options.full ? ' full' : '');
  btn.textContent = label;
  if (options.disabled) btn.disabled = true;
  if (options.active) btn.setAttribute('aria-pressed', 'true');
  btn.addEventListener('click', () => command(action));
  el.controls.appendChild(btn);
}
function buildControls() {
  el.controls.replaceChildren();
  if (active === 'torch') {
    const d = data.torch;
    makeButton(d.on ? '◼ SWITCH OFF' : '▶ SWITCH ON', 'switch', { primary: true, disabled: d.charge <= 0 });
    makeButton('⏩ USE IT UP', 'fast', { disabled: d.charge <= 0 });
    makeButton('↻ REPLACE AA', 'replace', { disabled: d.charge > 0, active: d.charge <= 0 });
    makeButton('⟲ RESET', 'reset');
  } else if (active === 'car') {
    const d = data.car;
    makeButton(d.cranking ? '⋯ STARTING' : d.engine ? '◼ STOP ENGINE' : '▶ START ENGINE', 'engine', { primary: true, disabled: d.cranking || (!d.engine && d.charge < 13) });
    makeButton(d.rev ? '↓ RETURN TO IDLE' : '↑ REV ENGINE', 'rev', { disabled: !d.engine, active: d.rev });
    makeButton(d.lights ? '✦ LIGHTS OFF' : '☼ LIGHTS ON', 'lights', { active: d.lights });
    makeButton('⟲ RESET', 'reset');
  } else {
    const d = data.controller;
    makeButton(d.playing ? '❚❚ PAUSE GAME' : '▶ PLAY GAME', 'play', { primary: true, disabled: d.charge <= 0 && !d.plugged });
    makeButton(d.plugged ? '⊖ UNPLUG' : '⚡ PLUG IN', 'plug', { active: d.plugged });
    makeButton(d.rumble ? '◉ RUMBLE OFF' : '◎ RUMBLE ON', 'rumble', { active: d.rumble });
    makeButton('⟲ RESET', 'reset');
  }
}

function stateKey() {
  const d = activeData();
  if (active === 'torch') return `${active}-${d.on}-${d.charge <= 0}`;
  if (active === 'car') return `${active}-${d.engine}-${d.cranking}-${d.rev}-${d.lights}-${d.charge>=99}`;
  return `${active}-${d.playing}-${d.plugged}-${d.rumble}-${d.charge<=0}`;
}
function setReaction(chem) {
  el.equationContext.textContent = chem.context;
  el.equationOx.textContent = chem.ox;
  el.equationRed.textContent = chem.red;
  el.equationFootnote.textContent = chem.footnote;
}

function updateDisplay() {
  const d = activeData();
  el.batteryPercent.textContent = roundedCharge() + '%';
  el.batteryTrack.setAttribute('aria-valuenow', String(roundedCharge()));
  el.batteryFill.style.width = d.charge + '%';
  el.batteryFill.classList.toggle('low', d.charge <= 23);
  const key = stateKey();
  if (key === lastStateKey) return;
  lastStateKey = key;
  let status = 'READY', statusClass = 'status-idle', process = 'IDLE';
  if (active === 'torch') {
    el.sceneLabel.textContent = '01 · PRIMARY / ALKALINE';
    el.monitorTitle.textContent = 'ALKALINE / AA';
    el.classValue.textContent = 'PRIMARY';
    el.energyPath.textContent = 'Zn → ELECTRONS → LIGHT';
    el.microNote.textContent = 'Primary alkaline cells are replaced, not plugged into a charger.';
    el.oxidationText.textContent = 'Zn releases electrons at the negative anode.';
    el.reductionText.textContent = 'MnO₂ accepts electrons at the positive cathode.';
    el.takeawayText.textContent = 'A conventional alkaline cell is designed for one discharge life, then replacement.';
    setReaction(chemistry.torch);
    if (d.charge <= 0) {
      status = 'EMPTY'; statusClass = 'status-low'; process = 'DEPLETED';
      el.sceneCaption.textContent = 'CELL DEPLETED · REPLACE THE AA';
      el.stateExplanation.textContent = 'The cell can no longer power the torch. Replace it with a fresh primary cell.';
    } else if (d.on) {
      status = 'LIGHT ON'; statusClass = 'status-on'; process = 'DISCHARGING';
      el.sceneCaption.textContent = 'CHEMICAL ENERGY → ELECTRICAL → LIGHT';
      el.stateExplanation.textContent = 'The circuit is closed: redox reactions supply electrons to the bulb.';
    } else {
      el.sceneCaption.textContent = 'SWITCH ON TO COMPLETE THE CIRCUIT';
      el.stateExplanation.textContent = 'The torch is off and the circuit is open. The battery is ready.';
    }
  } else if (active === 'car') {
    el.sceneLabel.textContent = '02 · SECONDARY / LEAD-ACID';
    el.monitorTitle.textContent = 'LEAD-ACID / 12V';
    el.classValue.textContent = 'SECONDARY';
    el.microNote.textContent = 'At low RPM, revving can increase available alternator output. A regulator and battery limit actual charging.';
    el.takeawayText.textContent = 'The lead-acid cell stores energy chemically and can recharge by reversing the discharge reaction.';
    if (d.engine) {
      status = d.rev ? 'REVVING' : 'CHARGING'; statusClass = 'status-charging'; process = 'CHARGING';
      el.sceneCaption.textContent = d.rev ? 'HIGHER RPM · MORE OUTPUT AVAILABLE' : 'ENGINE RUNNING · ALTERNATOR ACTIVE';
      el.energyPath.textContent = 'ENGINE → ALTERNATOR → BATTERY';
      el.stateExplanation.textContent = d.charge >= 99 ? 'Battery near full: the charging rate is limited.' : d.rev ? 'Engine speed is raised. The demo shows faster charging at low-RPM conditions.' : 'Alternator powers vehicle electrics and restores battery charge.';
      el.oxidationText.textContent = 'On charging, the positive plate is the anode; PbSO₄ reforms PbO₂.';
      el.reductionText.textContent = 'At the negative charging cathode, PbSO₄ reforms Pb.';
      setReaction(chemistry.carCharge);
    } else if (d.cranking) {
      status = 'STARTING'; statusClass = 'status-low'; process = 'HIGH CURRENT';
      el.sceneCaption.textContent = 'STARTER MOTOR DRAWS A SHORT CURRENT BURST';
      el.energyPath.textContent = 'BATTERY → STARTER → ENGINE';
      el.stateExplanation.textContent = 'The battery delivers a brief, high starter current. The charge drop is exaggerated.';
      el.oxidationText.textContent = 'Pb at the negative plate is oxidized to PbSO₄, releasing electrons.';
      el.reductionText.textContent = 'PbO₂ at the positive plate is reduced to PbSO₄.';
      setReaction(chemistry.carDischarge);
    } else {
      if (d.lights) { status = 'LOAD ON'; statusClass = 'status-low'; process = 'DISCHARGING'; }
      el.sceneCaption.textContent = d.lights ? 'ENGINE OFF · LIGHTS DRAW BATTERY POWER' : 'ENGINE OFF · PRESS START ENGINE';
      el.energyPath.textContent = d.lights ? 'BATTERY → HEADLIGHTS' : 'BATTERY → STARTER → ENGINE';
      el.stateExplanation.textContent = d.lights ? 'Engine off: cabin lights and accessories use the battery without recharging.' : 'Engine off: the battery is ready to power the starter motor.';
      el.oxidationText.textContent = 'Pb at the negative plate is oxidized to PbSO₄, releasing electrons.';
      el.reductionText.textContent = 'PbO₂ at the positive plate is reduced to PbSO₄.';
      setReaction(chemistry.carDischarge);
    }
  } else {
    el.sceneLabel.textContent = '03 · SECONDARY / LITHIUM-ION';
    el.monitorTitle.textContent = 'LITHIUM-ION / LCO';
    el.classValue.textContent = 'SECONDARY';
    el.takeawayText.textContent = 'Lithium ions shuttle between electrode structures; an external supply enables recharging.';
    el.microNote.textContent = 'Higher rumble increases energy use in this illustrative simulation.';
    if (d.plugged) {
      status = 'CHARGING'; statusClass = 'status-charging'; process = 'CHARGING';
      el.sceneCaption.textContent = 'EXTERNAL ELECTRICITY DRIVES RECHARGING';
      el.energyPath.textContent = 'POWER SUPPLY → Li⁺ → GRAPHITE';
      el.stateExplanation.textContent = 'The charger drives Li⁺ back toward graphite, restoring stored chemical energy.';
      el.oxidationText.textContent = 'During charging, the positive electrode releases Li⁺ and electrons.';
      el.reductionText.textContent = 'Graphite accepts Li⁺ and electrons at the negative electrode.';
      setReaction(chemistry.controllerCharge);
    } else if (d.playing && d.charge > 0) {
      status = 'PLAYING'; statusClass = 'status-on'; process = 'DISCHARGING';
      el.sceneCaption.textContent = 'CONTROLLER ON · ELECTRONS POWER THE GAME';
      el.energyPath.textContent = 'GRAPHITE → e⁻ → CONTROLLER';
      el.stateExplanation.textContent = d.rumble ? 'Playing with rumble: the demo drains faster because more energy is used.' : 'Playing: Li⁺ moves internally as electrons power the controller.';
      el.oxidationText.textContent = 'At discharge, LiC₆ releases Li⁺ and an electron.';
      el.reductionText.textContent = 'Li⁺ and electrons enter the cobalt oxide cathode.';
      setReaction(chemistry.controllerDischarge);
    } else if (d.charge <= 0) {
      status = 'EMPTY'; statusClass = 'status-low'; process = 'DEPLETED';
      el.sceneCaption.textContent = 'BATTERY EMPTY · PLUG IN TO RECHARGE';
      el.energyPath.textContent = 'POWER SUPPLY → RECHARGE';
      el.stateExplanation.textContent = 'The controller is out of battery energy. Plug it in to recharge.';
      el.oxidationText.textContent = 'On discharge, graphite releases Li⁺ and electrons.';
      el.reductionText.textContent = 'The positive electrode accepts Li⁺ and electrons.';
      setReaction(chemistry.controllerDischarge);
    } else {
      el.sceneCaption.textContent = 'READY TO PLAY · OR PLUG IN TO RECHARGE';
      el.energyPath.textContent = 'CHEMICAL → ELECTRICAL → GAME';
      el.stateExplanation.textContent = 'The controller is idle. Start playing or connect the charging cable.';
      el.oxidationText.textContent = 'At discharge, LiC₆ releases Li⁺ and an electron.';
      el.reductionText.textContent = 'Li⁺ and electrons enter the cobalt oxide cathode.';
      setReaction(chemistry.controllerDischarge);
    }
  }
  el.statusBadge.textContent = status;
  el.statusBadge.className = 'status-badge ' + statusClass;
  el.processValue.textContent = process;
}

// Pixel-canvas helpers: all illustrations are original primitives, no external artwork.
function R(x, y, w, h, color, a=1) { ctx.globalAlpha = a; ctx.fillStyle = color; ctx.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h)); ctx.globalAlpha=1; }
function P(points, color, a=1) { ctx.globalAlpha=a; ctx.fillStyle=color; ctx.beginPath(); ctx.moveTo(Math.round(points[0][0]),Math.round(points[0][1])); for(let i=1;i<points.length;i++)ctx.lineTo(Math.round(points[i][0]),Math.round(points[i][1]));ctx.closePath();ctx.fill();ctx.globalAlpha=1; }
function T(str, x, y, color='#18254b', size=9, align='left') { ctx.font = `900 ${size}px monospace`; ctx.fillStyle=color;ctx.textAlign=align;ctx.fillText(str,x,y);ctx.textAlign='left'; }
function O(x,y,w,h,edge,inside,b=2) { R(x,y,w,h,edge);R(x+b,y+b,w-2*b,h-2*b,inside); }
function circle(x,y,r,color){ctx.fillStyle=color;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();}
function stroke(x1,y1,x2,y2,color='#604fba',width=3){ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();}
function spark(x,y,t,color='#fff1a9'){const pulse=(Math.floor(t*3)%2===0); R(x-1,y-4,3,9,color,pulse?1:.45);R(x-4,y-1,9,3,color,pulse?1:.45);}
function batteryIcon(x,y,level){O(x,y,38,20,'#202d58','#f9faff',2);R(x+38,y+6,4,7,'#202d58'); const n=Math.max(0,Math.floor(level/25));for(let i=0;i<4;i++)R(x+4+i*8,y+5,6,10,i<n?'#3bbb9c':'#c9cbe0');}
function atmosphericDots(t, theme){for(let i=0;i<22;i++){const x=(i*83+34)%312; const y=(i*37+7)%132;R(x,y,2,2,theme,(Math.floor(t+i/3)%5===0)?1:.55);}}
function drawTorch(t){
  R(0,0,320,190,'#24356f'); R(0,140,320,50,'#1c285a');
  atmosphericDots(t,'#6983b4');
  for(let i=0;i<11;i++){const xx=i*33;R(xx,145,21,3,'#344779');R(xx+11,152,11,2,'#344779');}
  T('PRIMARY CELL / ALKALINE',14,14,'#d5dff8',8);
  batteryIcon(19,24,data.torch.charge);
  const d=data.torch; const working=d.on&&d.charge>0;
  if(working){ const power=clamp(d.charge/45,.25,1);P([[165,80],[320,23],[320,159],[165,118]],'#fff1a3',.12+.20*power);P([[169,91],[320,52],[320,131],[169,112]],'#ffe888',.16+.22*power);for(let i=0;i<8;i++){const px=191+i*16;R(px,84+(i%3)*10,3,3,'#ffe795',power*.8);}}
  O(56,77,115,46,'#151e4d','#6456ba',4);R(61,83,104,7,'#9887e2');R(62,115,93,4,'#383584');
  R(50,82,13,35,'#1b2353');R(47,85,7,29,'#d5d8e8');R(49,88,4,22,'#66719e');
  O(158,77,20,45,'#111e4a','#d7e3ef',3);R(170,81,5,36,working?'#ffe487':'#7d8ca7');R(176,88,3,22,'#364369');
  R(100,69,28,10,'#1b2556');R(103,66,22,4,working?'#64debb':'#b5b7d9');
  R(90,126,60,17,'#1b2556');R(94,126,52,14,'#8b7ad3');R(98,139,44,3,'#2a306b');
  T(working?'LIGHT ON':'LIGHT OFF',94,99,working?'#fff5b8':'#d9d6ff',12);
  if(working){spark(183,98,t,'#ffdf6a');}else if(d.charge<=0){T('EMPTY!',225,92,'#ffc473',13);}
  O(23,164,274,12,'#354675','#334f88',1);R(27,168,266,2,'#536998');
}
function drawWheel(x,y,t,rev){circle(x+1,y+1,17,'#2b2b45');circle(x,y,16,'#182345');circle(x,y,11,'#464c61');circle(x,y,6,'#acb4c5');circle(x,y,3,'#343b4e');for(let a=0;a<4;a++){const rot=(rev?t*3:0)+a*Math.PI/2;const xx=Math.round(x+Math.cos(rot)*8),yy=Math.round(y+Math.sin(rot)*8);R(xx-2,yy-2,4,4,'#d2d6e0');}}
function drawPatrol(t){
  const d=data.car; R(0,0,320,190,'#a7e3e8');R(0,105,320,45,'#d5e5c1');
  P([[0,126],[37,115],[84,126],[136,113],[200,126],[262,115],[320,126],[320,154],[0,154]],'#e4d3a4');
  R(0,151,320,39,'#454b60');R(0,156,320,3,'#67768a');for(let x=22;x<320;x+=51)R(x,176,25,3,'#f2e9c4');
  R(268,22,4,12,'#b4a0e4');R(260,28,19,6,'#b4a0e4');R(12,114,16,20,'#9d98aa');
  O(231,15,67,45,'#2b345b','#f7f8ff');T(d.engine?'ALT ON':'BATT',240,27,d.engine?'#23a383':'#6b60b1',8);batteryIcon(241,32,d.charge);
  if(d.lights){P([[50,117],[0,96],[0,138],[50,132]],'#fff2a9',.52);R(43,115,9,12,'#fff4b5');}
  const j=d.cranking?Math.floor(t*18)%2:0;const yOff=j;
  // wheel wells and undercarriage
  R(33,130+yOff,254,21,'#2d2e43');
  P([[46,111+yOff],[80,105+yOff],[102,79+yOff],[231,79+yOff],[251,110+yOff],[288,116+yOff],[290,143+yOff],[36,143+yOff]],'#594d56');
  P([[48,114+yOff],[87,105+yOff],[107,82+yOff],[230,82+yOff],[247,106+yOff],[279,114+yOff],[282,136+yOff],[43,136+yOff]],'#d5c8b4');
  R(54,115+yOff,227,15,'#ede4cd');R(57,133+yOff,218,4,'#bdb5a8');
  // roof + windshield shape
  P([[103,85+yOff],[122,80+yOff],[226,80+yOff],[236,85+yOff]],'#f9eddf');
  P([[105,88+yOff],[119,86+yOff],[151,86+yOff],[147,105+yOff],[88,105+yOff]],'#293a52');
  P([[154,86+yOff],[189,86+yOff],[189,105+yOff],[151,105+yOff]],'#29394e');
  P([[194,86+yOff],[225,86+yOff],[242,105+yOff],[194,105+yOff]],'#28384d');
  R(103,89+yOff,44,4,'#52677f');R(156,89+yOff,31,4,'#516a81');R(196,88+yOff,28,4,'#52677f');
  R(151,86+yOff,3,44,'#c1b4ab');R(192,86+yOff,3,45,'#bfb2a7');
  R(110,79+yOff,116,3,'#252f48');R(120,74+yOff,6,5,'#747e85');R(209,74+yOff,6,5,'#747e85');
  // distinctive red side stripe / Y61 reference
  P([[44,114+yOff],[89,108+yOff],[101,111+yOff],[140,111+yOff],[158,106+yOff],[191,107+yOff],[235,119+yOff],[208,123+yOff],[167,114+yOff],[140,122+yOff],[102,116+yOff],[72,122+yOff]],'#bd3543');
  P([[70,115+yOff],[104,110+yOff],[126,113+yOff],[92,116+yOff]],'#ec7580');
  R(119,117+yOff,22,2,'#fbe0ba');R(164,117+yOff,22,2,'#fbe0ba');
  R(149,117+yOff,2,15,'#bbafa4');R(191,117+yOff,2,15,'#b3a89d');
  R(55,119+yOff,17,3,'#292c3d');R(47,115+yOff,7,8,'#f7e4a5');R(35,125+yOff,11,14,'#37435a');
  R(283,121+yOff,9,17,'#323c4c');R(279,111+yOff,6,9,'#cf525a');
  // wheels
  drawWheel(93,145+yOff,t,d.rev);drawWheel(228,145+yOff,t,d.rev);
  // spare wheel as recognizable Patrol rear tailgate spare
  circle(287,122+yOff,17,'#252b38');circle(287,122+yOff,12,'#b2b6b8');circle(287,122+yOff,7,'#6e7881');circle(287,122+yOff,3,'#d5d1cd');
  // status pixels
  T('PATROL',119,131+yOff,'#4b5262',9);
  if(d.engine){spark(29,29,t,'#ffdf62');T(d.rev?'RPM ↑':'IDLE',16,66,'#2d677b',12);if(d.rev){for(let i=0;i<3;i++)R(17+i*9,95-(Math.floor(t*7+i*3)%3)*4,5,4,'#f1fbff',.8);}}
  if(d.cranking){T('CRANK!',17,67,'#55469c',12);spark(49,75,t,'#fff1a0');}
  if(!d.engine&&!d.cranking)T('ENGINE OFF',15,67,'#4a5d78',11);
}
function drawController(t){
  const d=data.controller;R(0,0,320,190,'#3c326b');
  for(let x=0;x<320;x+=24)R(x,152,12,2,'#57457e');
  atmosphericDots(t,'#816ca9');
  // pixel game screen
  O(85,17,150,68,'#19254c','#151c45',4);R(94,25,132,3,'#405387');
  if(d.playing){
    for(let i=0;i<9;i++){const xx=101+((i*23+Math.floor(t*8)*(i%2+1))%115);const yy=35+(i*17)%33;R(xx,yy,3,3,i%2?'#f6d06d':'#7cddd2');}
    const sx=153+Math.sin(t*4)*22;P([[sx,64],[sx-10,70],[sx,75],[sx+10,70]],'#ffbd6c');R(sx-2,60,4,4,'#f9f3ba');
    T('PLAYING',124,37,'#55d8b6',9);
  } else {T(d.charge<=0&&!d.plugged?'OUT OF POWER':'PRESS PLAY',160,56,d.charge<=0?'#ffab9d':'#d5ccff',11,'center');}
  // controller silhouette / supports
  P([[71,105],[106,92],[213,92],[249,105],[269,137],[246,158],[207,151],[112,151],[73,158],[52,137]],'#151d3d');
  P([[73,106],[107,96],[212,96],[247,107],[263,137],[242,152],[209,146],[110,146],[77,152],[59,137]],'#8c76dc');
  R(117,99,89,10,'#b6a2f0');R(109,143,105,5,'#6158b1');
  // shoulder buttons
  O(95,90,36,11,'#222957','#b6b6db',2);O(191,90,36,11,'#222957','#b6b6db',2);
  // directional pad left
  R(100,117,29,8,'#24305c');R(110,107,9,29,'#24305c');R(112,115,5,14,'#d8d8eb');R(105,119,19,4,'#d8d8eb');
  // two analogue sticks
  circle(142,138,13,'#39416d');circle(142,138,8,'#4e5a92');circle(178,138,13,'#39416d');circle(178,138,8,'#4e5a92');
  // action keys
  circle(218,116,5,'#eac26c');circle(232,123,5,'#ef85ac');circle(206,124,5,'#5cd4c4');circle(219,133,5,'#e6b0e6');
  R(155,113,10,3,'#2c315e');R(170,113,10,3,'#2c315e');
  if(d.rumble&&d.playing&&Math.floor(t*13)%2){R(43,119,5,4,'#ffda77');R(271,123,5,4,'#ffda77');}
  if(d.plugged){ // USB cable + charge lightning
    stroke(161,95,161,78,'#f6e1a4',3);stroke(161,78,276,78,'#f6e1a4',3);stroke(276,78,276,43,'#f6e1a4',3);
    O(263,25,28,18,'#161e49','#f6f0de',2);R(270,30,6,7,'#f4ce5d');spark(247,36,t,'#ffdc72');
  }
  T(d.plugged?'CABLE IN':d.playing?'WIRELESS PLAY':'STANDBY',160,170,'#ded3ff',9,'center');
  batteryIcon(17,20,d.charge);
}

function drawFrame(now){
  const dt=Math.min(.08,(now-previousTime)/1000||0); previousTime=now;drawTime=now/1000;
  const d=activeData();
  if(active==='torch'&&d.on){d.charge=clamp(d.charge-dt*4.2,0,100);if(d.charge===0){d.on=false;buildControls();lastStateKey='';}}
  if(active==='car'){
    let change=0;
    if(d.engine){const base=d.rev?4.4:2.35;change=base-(d.lights?0.9:0);if(d.charge>92)change*=.35;}
    else if(d.lights){change=-1.9;}
    d.charge=clamp(d.charge+change*dt,0,100);
  }
  if(active==='controller'){
    let change=(d.playing?-(d.rumble?4.1:2.8):0);
    if(d.plugged)change+=d.charge>94?1.2:4.8;
    d.charge=clamp(d.charge+change*dt,0,100);
    if(d.charge===0&&d.playing&&!d.plugged){d.playing=false;lastStateKey='';buildControls();}
  }
  updateDisplay();
  if(active==='torch')drawTorch(drawTime);
  if(active==='car')drawPatrol(drawTime);
  if(active==='controller')drawController(drawTime);
  requestAnimationFrame(drawFrame);
}

selectScene('torch');
requestAnimationFrame(drawFrame);
