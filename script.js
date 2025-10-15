const canvas = document.getElementById('sonar');
const ctx = canvas.getContext('2d');
const rangeDisplay = document.getElementById('range');
const contactsDisplay = document.getElementById('contacts');
const powerBtn = document.getElementById('powerBtn');
const detectionPopup = document.getElementById('detectionPopup');
const popupLat = document.getElementById('popupLat');
const popupLon = document.getElementById('popupLon');
const popupBearing = document.getElementById('popupBearing');
const popupDistance = document.getElementById('popupDistance');
const popupThreat = document.getElementById('popupThreat');
const popupTime = document.getElementById('popupTime');
const missileBtn = document.getElementById('missileBtn');
const nukeTimer = document.getElementById('nukeTimer');
const explosion = document.getElementById('explosion');
const nukeFlash = document.getElementById('nukeFlash');

// Particle system for background
const particleCanvas = document.getElementById('particles');
const particleCtx = particleCanvas.getContext('2d');
let particles = [];

let sweepAngle = 0;
let blips = [];
let lastBlipTime = 0;
let contacts = 0;
let isPowered = true;
let lastClickTime = 0;
let currentTarget = null;

// Audio context for synthetic beep
let audioContext;
let isAudioInitialized = false;

function initAudio() {
  if (!isAudioInitialized) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    isAudioInitialized = true;
  }
}

function createImpulseResponse(audioContext, duration, decay) {
  const length = audioContext.sampleRate * duration;
  const impulse = audioContext.createBuffer(2, length, audioContext.sampleRate);
  
  for (let channel = 0; channel < 2; channel++) {
    const channelData = impulse.getChannelData(channel);
    for (let i = 0; i < length; i++) {
      const n = length - i;
      channelData[i] = (Math.random() * 2 - 1) * Math.pow(n / length, decay);
    }
  }
  return impulse;
}

function playBeep(frequency = 800, duration = 200, volume = 0.3) {
  if (!isAudioInitialized) return;
  
  const now = audioContext.currentTime;
  const totalDuration = duration / 1000;
  
  // Create convolution reverb for realistic submarine acoustics
  const convolver = audioContext.createConvolver();
  convolver.buffer = createImpulseResponse(audioContext, 2, 3);
  
  // Main oscillator for the ping
  const mainOsc = audioContext.createOscillator();
  const subOsc = audioContext.createOscillator();
  
  // Gain nodes for mixing
  const mainGain = audioContext.createGain();
  const subGain = audioContext.createGain();
  const masterGain = audioContext.createGain();
  const reverbGain = audioContext.createGain();
  const dryGain = audioContext.createGain();
  
  // Filters for shaping
  const lowpass = audioContext.createBiquadFilter();
  const bandpass = audioContext.createBiquadFilter();
  
  // Configure oscillators
  mainOsc.type = 'sine';
  mainOsc.frequency.setValueAtTime(frequency, now);
  
  subOsc.type = 'sine';
  subOsc.frequency.setValueAtTime(frequency * 0.6, now);
  
  // Configure filters
  lowpass.type = 'lowpass';
  lowpass.frequency.setValueAtTime(1200, now);
  lowpass.Q.setValueAtTime(2, now);
  
  bandpass.type = 'bandpass';
  bandpass.frequency.setValueAtTime(frequency * 1.2, now);
  bandpass.Q.setValueAtTime(15, now);
  
  // Connect audio graph
  mainOsc.connect(mainGain);
  subOsc.connect(subGain);
  
  mainGain.connect(bandpass);
  subGain.connect(lowpass);
  
  bandpass.connect(masterGain);
  lowpass.connect(masterGain);
  
  // Split for dry/wet
  masterGain.connect(dryGain);
  masterGain.connect(convolver);
  convolver.connect(reverbGain);
  
  dryGain.connect(audioContext.destination);
  reverbGain.connect(audioContext.destination);
  
  // Set gain levels
  mainGain.gain.setValueAtTime(0.7, now);
  subGain.gain.setValueAtTime(0.3, now);
  dryGain.gain.setValueAtTime(0.4, now);
  reverbGain.gain.setValueAtTime(0.6, now);
  
  // Create realistic submarine ping envelope
  const attackTime = 0.001;
  const peakTime = totalDuration * 0.1;
  const decayTime = totalDuration * 0.9;
  
  masterGain.gain.setValueAtTime(0, now);
  masterGain.gain.linearRampToValueAtTime(volume * 1.2, now + attackTime);
  masterGain.gain.exponentialRampToValueAtTime(volume, now + peakTime);
  masterGain.gain.exponentialRampToValueAtTime(0.001, now + decayTime);
  
  // Frequency sweep for doppler/distance effect
  mainOsc.frequency.exponentialRampToValueAtTime(frequency * 0.75, now + totalDuration);
  subOsc.frequency.exponentialRampToValueAtTime(frequency * 0.6 * 0.75, now + totalDuration);
  
  // Filter sweep for underwater propagation
  lowpass.frequency.exponentialRampToValueAtTime(400, now + totalDuration);
  bandpass.frequency.exponentialRampToValueAtTime(frequency * 0.8, now + totalDuration);
  
  // Start oscillators
  mainOsc.start(now);
  subOsc.start(now);
  
  // Stop oscillators
  mainOsc.stop(now + totalDuration);
  subOsc.stop(now + totalDuration);
}

function resizeCanvas() {
  const sonarContainer = document.querySelector('.sonar-container');
  const containerRect = sonarContainer.getBoundingClientRect();
  const size = Math.min(containerRect.width * 0.9, containerRect.height * 0.9, 600);
  canvas.width = size;
  canvas.height = size;
  
  // Resize particle canvas
  particleCanvas.width = window.innerWidth;
  particleCanvas.height = window.innerHeight;
  
  // Initialize particles
  initParticles();
}

function initParticles() {
  particles = [];
  const particleCount = Math.floor((window.innerWidth * window.innerHeight) / 15000);
  
  for (let i = 0; i < particleCount; i++) {
    particles.push({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      vx: (Math.random() - 0.5) * 0.5,
      vy: (Math.random() - 0.5) * 0.5,
      size: Math.random() * 2 + 1,
      opacity: Math.random() * 0.5 + 0.1,
      pulsePhase: Math.random() * Math.PI * 2
    });
  }
}

function updateParticles() {
  particleCtx.clearRect(0, 0, particleCanvas.width, particleCanvas.height);
  
  particles.forEach((particle, index) => {
    // Update position
    particle.x += particle.vx;
    particle.y += particle.vy;
    
    // Wrap around screen
    if (particle.x < 0) particle.x = particleCanvas.width;
    if (particle.x > particleCanvas.width) particle.x = 0;
    if (particle.y < 0) particle.y = particleCanvas.height;
    if (particle.y > particleCanvas.height) particle.y = 0;
    
    // Update pulse
    particle.pulsePhase += 0.02;
    const pulse = Math.sin(particle.pulsePhase) * 0.3 + 0.7;
    
    // Draw particle
    particleCtx.globalAlpha = particle.opacity * pulse;
    particleCtx.fillStyle = '#00ff41';
    particleCtx.beginPath();
    particleCtx.arc(particle.x, particle.y, particle.size * pulse, 0, Math.PI * 2);
    particleCtx.fill();
    
    // Draw connections to nearby particles
    particles.slice(index + 1).forEach(other => {
      const dx = particle.x - other.x;
      const dy = particle.y - other.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      if (distance < 100) {
        const opacity = (1 - distance / 100) * 0.1;
        particleCtx.globalAlpha = opacity;
        particleCtx.strokeStyle = '#00ff41';
        particleCtx.lineWidth = 0.5;
        particleCtx.beginPath();
        particleCtx.moveTo(particle.x, particle.y);
        particleCtx.lineTo(other.x, other.y);
        particleCtx.stroke();
      }
    });
  });
  
  particleCtx.globalAlpha = 1;
}

function drawSonar() {
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  const radius = canvas.width / 2 - 20;
  
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  if (!isPowered) {
    // Draw powered off state
    ctx.strokeStyle = '#333333';
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.3;
    
    for (let i = 1; i <= 5; i++) {
      const r = (radius / 5) * i;
      ctx.beginPath();
      ctx.arc(centerX, centerY, r, 0, 2 * Math.PI);
      ctx.stroke();
    }
    
    ctx.globalAlpha = 1;
    return;
  }
  
  // Draw concentric circles (range rings)
  ctx.strokeStyle = '#00ff41';
  ctx.lineWidth = 1;
  
  for (let i = 1; i <= 5; i++) {
    const r = (radius / 5) * i;
    ctx.beginPath();
    ctx.arc(centerX, centerY, r, 0, 2 * Math.PI);
    ctx.globalAlpha = 0.3;
    ctx.stroke();
  }
  
  // Draw crosshairs
  ctx.globalAlpha = 0.5;
  ctx.beginPath();
  ctx.moveTo(centerX - radius, centerY);
  ctx.lineTo(centerX + radius, centerY);
  ctx.moveTo(centerX, centerY - radius);
  ctx.lineTo(centerX, centerY + radius);
  ctx.stroke();
  
  // Draw sweep line with fade trail
  ctx.globalAlpha = 1;
  const sweepGradient = ctx.createLinearGradient(
    centerX, centerY,
    centerX + radius * Math.cos(sweepAngle),
    centerY + radius * Math.sin(sweepAngle)
  );
  sweepGradient.addColorStop(0, '#00ff4100');
  sweepGradient.addColorStop(0.7, '#00ff4180');
  sweepGradient.addColorStop(1, '#00ff41');
  
  ctx.strokeStyle = sweepGradient;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(centerX, centerY);
  ctx.lineTo(
    centerX + radius * Math.cos(sweepAngle),
    centerY + radius * Math.sin(sweepAngle)
  );
  ctx.stroke();
  
  // Draw sweep arc (fade effect)
  for (let i = 0; i < 30; i++) {
    const fadeAngle = sweepAngle - (i * 0.02);
    const alpha = Math.max(0, 1 - i / 30);
    ctx.globalAlpha = alpha * 0.1;
    ctx.strokeStyle = '#00ff41';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, fadeAngle - 0.1, fadeAngle);
    ctx.stroke();
  }
  
  // Draw blips
  ctx.globalAlpha = 1;
  blips.forEach((blip, index) => {
    const age = Date.now() - blip.birthTime;
    const maxAge = 8000; // 8 seconds
    
    if (age > maxAge) {
      blips.splice(index, 1);
      return;
    }
    
    const alpha = Math.max(0, 1 - age / maxAge);
    const size = 3 + Math.sin(age * 0.01) * 2; // Pulsing effect
    
    ctx.globalAlpha = alpha;
    ctx.fillStyle = blip.isTarget ? '#ff3333' : '#ffff00';
    ctx.shadowColor = blip.isTarget ? '#ff3333' : '#ffff00';
    ctx.shadowBlur = 15;
    
    ctx.beginPath();
    ctx.arc(blip.x, blip.y, size, 0, 2 * Math.PI);
    ctx.fill();
    
    // Draw target designation
    if (blip.isTarget) {
      ctx.shadowBlur = 0;
      ctx.strokeStyle = '#ff3333';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(blip.x, blip.y, 15, 0, 2 * Math.PI);
      ctx.stroke();
    }
    
    ctx.shadowBlur = 0;
  });
  
  ctx.globalAlpha = 1;
}

function createBlip() {
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  const radius = canvas.width / 2 - 20;
  
  const angle = Math.random() * 2 * Math.PI;
  const distance = Math.random() * (radius - 40) + 40;
  const isTarget = Math.random() < 0.3; // 30% chance of being a target
  
  const blip = {
    x: centerX + distance * Math.cos(angle),
    y: centerY + distance * Math.sin(angle),
    angle: angle,
    birthTime: Date.now(),
    isTarget: isTarget
  };
  
  blips.push(blip);
  contacts++;
  contactsDisplay.textContent = contacts;
}

function generateFakeCoordinates() {
  // Generate realistic submarine coordinates (fictional naval area)
  const baseLat = 35.2851; // Mediterranean Sea area
  const baseLon = 23.4567;
  
  // Add small random variations (within a few nautical miles)
  const latVariation = (Math.random() - 0.5) * 0.1; // ~5.5 nautical miles
  const lonVariation = (Math.random() - 0.5) * 0.1;
  
  const lat = baseLat + latVariation;
  const lon = baseLon + lonVariation;
  
  // Format coordinates in military style
  const latDeg = Math.floor(Math.abs(lat));
  const latMin = ((Math.abs(lat) - latDeg) * 60).toFixed(3);
  const latDir = lat >= 0 ? 'N' : 'S';
  
  const lonDeg = Math.floor(Math.abs(lon));
  const lonMin = ((Math.abs(lon) - lonDeg) * 60).toFixed(3);
  const lonDir = lon >= 0 ? 'E' : 'W';
  
  return {
    lat: `${latDeg}°${latMin}'${latDir}`,
    lon: `${lonDeg}°${lonMin}'${lonDir}`
  };
}

function showDetectionPopup(blip) {
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  
  // Calculate bearing and distance
  const deltaX = blip.x - centerX;
  const deltaY = centerY - blip.y; // Invert Y for proper bearing calculation
  const bearing = ((Math.atan2(deltaX, deltaY) * 180 / Math.PI) + 360) % 360;
  const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY) / (canvas.width / 2) * 5;
  
  // Generate fake coordinates
  const coords = generateFakeCoordinates();
  
  // Set popup data
  popupLat.textContent = coords.lat;
  popupLon.textContent = coords.lon;
  popupBearing.textContent = bearing.toFixed(0);
  popupDistance.textContent = distance.toFixed(1);
  
  // Set threat level based on target type
  const threatLevels = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
  const threatLevel = blip.isTarget ? 
    threatLevels[Math.floor(Math.random() * 2) + 2] : // HIGH or CRITICAL for targets
    threatLevels[Math.floor(Math.random() * 2)]; // LOW or MEDIUM for normal
  
  popupThreat.textContent = threatLevel;
  popupThreat.style.color = threatLevel === 'CRITICAL' ? '#ff0000' : 
                           threatLevel === 'HIGH' ? '#ff3333' :
                           threatLevel === 'MEDIUM' ? '#ff6600' : '#ffaa00';
  
  // Set current time in military format
  const now = new Date();
  const timeString = now.toTimeString().split(' ')[0] + 'Z';
  popupTime.textContent = timeString;
  
  // Store current target for missile strike
  currentTarget = blip;
  
  detectionPopup.classList.add('show');
  
  // Hide popup after 6 seconds (longer for missile option)
  setTimeout(() => {
    if (currentTarget === blip) {
      detectionPopup.classList.remove('show');
      currentTarget = null;
    }
  }, 6000);
}

function launchMissile() {
  if (!currentTarget) return;
  
  initAudio();
  
  // Start countdown
  let countdown = 3;
  nukeTimer.textContent = `IMPACT IN ${countdown}...`;
  missileBtn.disabled = true;
  missileBtn.style.opacity = '0.5';
  
  const countdownInterval = setInterval(() => {
    countdown--;
    if (countdown > 0) {
      nukeTimer.textContent = `IMPACT IN ${countdown}...`;
      // Play countdown beep
      playBeep(800, 200, 0.4);
    } else {
      nukeTimer.textContent = 'IMPACT!';
      clearInterval(countdownInterval);
      
      // Trigger explosion
      triggerNuclearExplosion();
      
      // Remove target from blips
      const index = blips.indexOf(currentTarget);
      if (index > -1) {
        blips.splice(index, 1);
      }
      
      // Reset after explosion
      setTimeout(() => {
        nukeTimer.textContent = 'WARHEAD ARMED';
        missileBtn.disabled = false;
        missileBtn.style.opacity = '1';
        detectionPopup.classList.remove('show');
        currentTarget = null;
      }, 4000);
    }
  }, 1000);
}

function triggerNuclearExplosion() {
  // Flash effect
  nukeFlash.classList.add('active');
  setTimeout(() => {
    nukeFlash.classList.remove('active');
  }, 500);
  
  // Explosion effect
  explosion.classList.add('active');
  setTimeout(() => {
    explosion.classList.remove('active');
  }, 3000);
  
  // Nuclear explosion sound effect
  playNuclearExplosion();
}

function playNuclearExplosion() {
  if (!isAudioInitialized) return;
  
  // Create complex explosion sound
  const duration = 2;
  const now = audioContext.currentTime;
  
  // Low rumble
  const rumble = audioContext.createOscillator();
  const rumbleGain = audioContext.createGain();
  rumble.type = 'sawtooth';
  rumble.frequency.setValueAtTime(30, now);
  rumble.frequency.exponentialRampToValueAtTime(15, now + duration);
  rumbleGain.gain.setValueAtTime(0.4, now);
  rumbleGain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  rumble.connect(rumbleGain);
  rumbleGain.connect(audioContext.destination);
  rumble.start(now);
  rumble.stop(now + duration);
  
  // High frequency crack
  const crack = audioContext.createOscillator();
  const crackGain = audioContext.createGain();
  crack.type = 'square';
  crack.frequency.setValueAtTime(2000, now);
  crack.frequency.exponentialRampToValueAtTime(100, now + 0.3);
  crackGain.gain.setValueAtTime(0.3, now);
  crackGain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
  crack.connect(crackGain);
  crackGain.connect(audioContext.destination);
  crack.start(now);
  crack.stop(now + 0.3);
  
  // Noise burst
  const noise = audioContext.createBufferSource();
  const noiseBuffer = audioContext.createBuffer(1, audioContext.sampleRate * 0.5, audioContext.sampleRate);
  const output = noiseBuffer.getChannelData(0);
  for (let i = 0; i < output.length; i++) {
    output[i] = Math.random() * 2 - 1;
  }
  noise.buffer = noiseBuffer;
  const noiseGain = audioContext.createGain();
  noiseGain.gain.setValueAtTime(0.2, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
  noise.connect(noiseGain);
  noiseGain.connect(audioContext.destination);
  noise.start(now);
}

function checkSweepHits() {
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  
  blips.forEach(blip => {
    const blipAngle = Math.atan2(blip.y - centerY, blip.x - centerX);
    let angleDiff = Math.abs(sweepAngle - blipAngle);
    
    // Handle angle wraparound
    if (angleDiff > Math.PI) {
      angleDiff = 2 * Math.PI - angleDiff;
    }
    
    if (angleDiff < 0.05 && !blip.detected) {
      blip.detected = true;
      initAudio();
      
      // Show popup for detection
      showDetectionPopup(blip);
      
      if (blip.isTarget) {
        playBeep(440, 800, 0.7); // Deep, menacing submarine ping for targets
      } else {
        playBeep(520, 450, 0.5); // Classic sonar ping for normal contacts
      }
    }
  });
}

function animate() {
  if (isPowered) {
    sweepAngle += 0.008; // Much slower sweep
    if (sweepAngle > 2 * Math.PI) {
      sweepAngle = 0;
      // Reset detection flags for next sweep
      blips.forEach(blip => blip.detected = false);
    }
  }
  
  drawSonar();
  updateParticles(); // Update background particles
  
  if (isPowered) {
    checkSweepHits();
    
    // Automatically create new blips
    const now = Date.now();
    if (now - lastBlipTime > 3000 + Math.random() * 7000) { // Every 3-10 seconds
      createBlip();
      lastBlipTime = now;
    }
    
    // Update range display with slight variation (0-5 metres)
    const baseRange = 5.2;
    const variation = Math.sin(now * 0.001) * 0.3;
    rangeDisplay.textContent = (baseRange + variation).toFixed(1);
  }
  
  requestAnimationFrame(animate);
}

// Initialize
window.addEventListener('resize', resizeCanvas);
window.addEventListener('orientationchange', () => {
  setTimeout(resizeCanvas, 100);
});

// Interactive features
powerBtn.addEventListener('click', () => {
  isPowered = !isPowered;
  if (isPowered) {
    powerBtn.textContent = 'POWER';
    powerBtn.classList.add('active');
    canvas.classList.remove('power-off');
  } else {
    powerBtn.textContent = 'OFF';
    powerBtn.classList.remove('active');
    canvas.classList.add('power-off');
    blips = []; // Clear all blips when powered off
    detectionPopup.classList.remove('show');
    currentTarget = null;
  }
  initAudio();
});

// Missile launch button
missileBtn.addEventListener('click', launchMissile);

// Canvas click/touch interaction
canvas.addEventListener('click', (e) => {
  const now = Date.now();
  if (now - lastClickTime < 500) return; // Prevent rapid clicking
  lastClickTime = now;
  
  if (isPowered) {
    const rect = canvas.getBoundingClientRect();
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const clickX = (e.clientX - rect.left) * (canvas.width / rect.width);
    const clickY = (e.clientY - rect.top) * (canvas.height / rect.height);
    
    // Create a blip near the click location
    const blip = {
      x: clickX,
      y: clickY,
      angle: Math.atan2(clickY - centerY, clickX - centerX),
      birthTime: Date.now(),
      isTarget: Math.random() < 0.5
    };
    
    blips.push(blip);
    contacts++;
    contactsDisplay.textContent = contacts;
    initAudio();
  }
});

// Touch event to initialize audio context on mobile
document.addEventListener('touchstart', initAudio, { once: true });
document.addEventListener('click', initAudio, { once: true });

// Initialize power button state
powerBtn.classList.add('active');

resizeCanvas();
animate();

// Create initial blip after 2 seconds
setTimeout(() => {
  if (isPowered) createBlip();
}, 2000);
