const container = document.getElementById("threejs-container");
const trackContainer = document.getElementById("track-container");
const albumart = document.getElementById("albumart");
const headerTitle = document.getElementById("track-title");
const headerArtist = document.getElementById("track-artist");
let currentTextureSrc = null;
let currentCircleRadius = 0;
let clock = new THREE.Clock();
const gui = new dat.GUI();
// is first texture in use in use for transition
let isTexture0 = false;
// transition animation queue
let textureQueue = Promise.resolve();
let isPaused = false,
  elapsedResetTime = 21600,
  elapsedPreviousTime = 0;
const colorThief = new ColorThief();
const backgroundSrcDefault = "media/background.jpg";

let scene, camera, renderer, material;
let settings = {
  scale: 1,
  debug: false,
  fps: 60,
  parallaxVal: 0,
};

const config = {
  FREQ_RANGE: 40,
  FREQ_MULTI: 0.1,
  speed_multi:0.5,
}

async function init() {
  renderer = new THREE.WebGLRenderer({
    antialias: false,
    preserveDrawingBuffer: false,
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(settings.scale);
  container.appendChild(renderer.domElement);
  scene = new THREE.Scene();
  camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  //caching for textureloader
  //ref: https://threejs.org/docs/#api/en/loaders/Cache
  THREE.Cache.enabled = true;

  material = new THREE.ShaderMaterial({
    uniforms: {
      u_tex0: { type: "t" },
      u_tex1: { type: "t" },
      u_time: { value: 1, type: "f" },
      u_blend: { value: 0, type: "f" },
      u_speed: { value: 0.1, type: "f" },
      u_square: { value: true, type: "b" },
      u_resolution: {
        value: new THREE.Vector2(window.innerWidth * settings.scale, window.innerHeight * settings.scale),
        type: "v2",
      },
      u_center: { value: false, type: "b" },
      u_center_radius: { value: 1, type: "f" },
      u_center_color: { type: "c", value: { r: 0, g: 0, b: 0 } },
    },
    vertexShader: `
          varying vec2 vUv;        
          void main() {
              vUv = uv;
              gl_Position = vec4( position, 1.0 );    
          }
        `,
  });
  material.fragmentShader = await (await fetch("shaders/tunnel.frag")).text();

  setTexture(backgroundSrcDefault);
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2, 1, 1), material);
  scene.add(quad);

  if (settings.debug) {
    //createWebUI();
    gui.show();
  } else {
    gui.hide();
  }

  //start animation
  render();
}

window.addEventListener("resize", function (e) {
  renderer.setSize(window.innerWidth, window.innerHeight);
  material.uniforms.u_resolution.value = new THREE.Vector2(
    window.innerWidth * settings.scale,
    window.innerHeight * settings.scale
  );
});

//parallax
document.addEventListener("mousemove", function (event) {
  if (settings.parallaxVal == 0) return;

  const x = (window.innerWidth - event.pageX * settings.parallaxVal) / 90;
  const y = (window.innerHeight - event.pageY * settings.parallaxVal) / 90;

  container.style.transform = `translateX(${x}px) translateY(${y}px) scale(1.09)`;
});

function setScale(value) {
  if (settings.scale == value) return;

  settings.scale = value;
  renderer.setPixelRatio(settings.scale);
  material.uniforms.u_resolution.value = new THREE.Vector2(
    window.innerWidth * settings.scale,
    window.innerHeight * settings.scale
  );
}

let lastTime = performance.now();
let deltaTime = 0;
let smoothedDelta = 0; // Smoothed frame time

let _saved_speed = 0;
let lastComputedSpeed = 0; // Stores the last computed speed from the audio listener

// Function to update time
function update_time() {
    let currentTime = performance.now();
    let rawDelta = (currentTime - lastTime) / 1000; // Convert to seconds
    lastTime = currentTime;
    
    // Apply smoothing to deltaTime fluctuations
    const smoothingFactor = 0.1;
    smoothedDelta = smoothedDelta * (1 - smoothingFactor) + rawDelta * smoothingFactor;
}

// Function that listens to audio (not guaranteed to run every frame)
function livelyAudioListener(audioArray) {
    if (!_audioReact) return;

    let speed = 0.0;

    for (let i = 0; i <= config.FREQ_RANGE; i++) {
        speed += audioArray[i] * 2;
    }

    speed /= config.FREQ_RANGE * 2 * config.FREQ_MULTI;

    // Store the latest computed speed
    lastComputedSpeed = speed;
	//DEBUG
	//headerArtist.innerText = `${_saved_speed} ${config.speed_multi} ${_audioReact}`;
}

// Main update function that runs every frame
function update_loop() {  
    update_time();

    // Smoothly interpolate `_saved_speed` using last known speed from livelyAudioListener
    _saved_speed += 0.01 + smoothedDelta * lastComputedSpeed * config.speed_multi;
}

function render() {
  setTimeout(function () {
    requestAnimationFrame(render);
	update_time();
  }, 1000 / settings.fps);
  update_loop();
  //reset every 6hr
  if (clock.getElapsedTime() > elapsedResetTime) clock = new THREE.Clock();
  material.uniforms.u_speed.value = _saved_speed;
  renderer.render(scene, camera);
}
init();

function livelyWallpaperPlaybackChanged(data) {
  var obj = JSON.parse(data);
  isPaused = obj.IsPaused;

  if (isPaused) {
    elapsedPreviousTime = clock.getElapsedTime();
    elapsedPreviousTime = elapsedPreviousTime > elapsedResetTime ? 0 : elapsedPreviousTime;
    clock.stop();
  } else {
    clock.start();
    clock.elapsedTime = elapsedPreviousTime;
  }
}
let _audioReact = true;
//docs: https://github.com/rocksdanister/lively/wiki/Web-Guide-IV-:-Interaction
function livelyPropertyListener(name, val) {
  switch (name) {
    // case "speed":
      // material.uniforms.u_speed.value = val;
      // break;
    case "isSquare":
      material.uniforms.u_square.value = val;
      break;
    case "colorRadius":
      material.uniforms.u_center_radius.value = val;
      break;
    case "blurIntensity":
      container.style.filter = "blur(" + val + "px)";
      break;
    case "displayScaling":
      setScale(val);
      break;
    case "parallaxIntensity":
      settings.parallaxVal = val;
      break;
    case "fpsLock":
      settings.fps = val ? 30 : 120;
      break;
	// case "audioReact":
      // _audioReact = val;
      // break;
  }
}

async function livelyCurrentTrack(data) {
  let obj = JSON.parse(data);
  //when no track is playing its null
  if (obj != null) {
    headerTitle.innerText = obj.Title;
    headerArtist.innerText = obj.Artist;

    if (obj.Thumbnail != null) {
      const base64String = !obj.Thumbnail.startsWith("data:image/")
        ? "data:image/png;base64," + obj.Thumbnail
        : obj.Thumbnail;

      setTexture(base64String);
      albumart.src = base64String;
    } else {
      setTexture(backgroundSrcDefault);
      albumart.src = backgroundSrcDefault;
    }

    if (material != null) material.uniforms.u_center.value = true;
    trackContainer.style.opacity = 1;
  } else {
    setTexture(backgroundSrcDefault);
    if (material != null) material.uniforms.u_center.value = false;

    trackContainer.style.opacity = 0;
  }
}

albumart.addEventListener("load", function () {
  let color = colorThief.getPalette(albumart, 6);
  color.unshift(colorThief.getColor(albumart));

  let mainColor = `rgb(${color[1].toString()}`; //assume
  let minc = -999;
  for (let i = 1; i < color.length; i++) {
    let tmp = contrast(color[0], color[i]);
    if (tmp > minc) {
      minc = tmp;
      mainColor = `rgb(${color[i].toString()}`;
    }
  }

  setColor(mainColor, `rgb(${color[0].toString()})`);
});

async function setTexture(src) {
  if (src === currentTextureSrc) return;
  currentTextureSrc = src;

  const currentOperation = textureQueue.then(async () => {
    if (material == null) return;

    return new Promise((resolve) => {
      new THREE.TextureLoader().load(src, async function (tex) {
        tex.wrapS = THREE.MirroredRepeatWrapping;
        tex.wrapT = THREE.MirroredRepeatWrapping;

        if (isTexture0) material.uniforms.u_tex0.value = tex;
        else material.uniforms.u_tex1.value = tex;

        await showTransition(isTexture0);
        isTexture0 = !isTexture0;

        resolve();
      });
    });
  });

  // Update to the latest operation
  textureQueue = currentOperation;
}

async function showTransition(isTexture0) {
  return new Promise((resolve) => {
    const initialValue = isTexture0 ? 1 : 0;
    const finalValue = isTexture0 ? 0 : 1;
    const duration = 500;
    let startTime;

    function animate(timestamp) {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      const val = initialValue + (finalValue - initialValue) * progress;
      material.uniforms.u_blend.value = val;

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        if (isTexture0 && material.uniforms.u_tex1.value) {
          material.uniforms.u_tex1.value.dispose();
          material.uniforms.u_tex1.value = null;
        } else if (!isTexture0 && material.uniforms.u_tex0.value) {
          material.uniforms.u_tex0.value.dispose();
          material.uniforms.u_tex0.value = null;
        }
        resolve();
      }
    }
    requestAnimationFrame(animate);
  });
}

async function showTransitionScreenshot() {
  renderer.render(scene, camera); //WebGLRenderer.preserveDrawingBuffer is false.
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2, 1, 1));
  let screenShot = renderer.domElement.toDataURL();
  const texture = new THREE.TextureLoader().load(screenShot);
  quad.material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: 1.0 });
  scene.add(quad);

  for (let val = 1; val >= 0; val -= 0.1) {
    quad.material.opacity = val;
    await new Promise((r) => setTimeout(r, 50));
  }

  texture.dispose();
  scene.remove(quad);
  URL.revokeObjectURL(screenShot);
}

function setColor(mainColor, shadowColor) {
  document.documentElement.style.setProperty("--mainColor", mainColor); //highest contrast compared to dominant color
  document.documentElement.style.setProperty("--shadowColor", shadowColor); //dominant color
  if (material != null) material.uniforms.u_center_color.value = new THREE.Color(shadowColor);
}

//ref: https://stackoverflow.com/questions/9733288/how-to-programmatically-calculate-the-contrast-ratio-between-two-colors
function luminance(r, g, b) {
  var a = [r, g, b].map(function (v) {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
}

function contrast(rgb1, rgb2) {
  var lum1 = luminance(rgb1[0], rgb1[1], rgb1[2]);
  var lum2 = luminance(rgb2[0], rgb2[1], rgb2[2]);
  var brightest = Math.max(lum1, lum2);
  var darkest = Math.min(lum1, lum2);
  return (brightest + 0.05) / (darkest + 0.05);
}
