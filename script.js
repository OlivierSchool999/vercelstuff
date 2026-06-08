import {
  FaceLandmarker,
  HandLandmarker,
  FilesetResolver
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest";

const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

async function startCamera() {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: true
  });

  video.srcObject = stream;

  return new Promise(resolve => {
    video.onloadedmetadata = () => resolve();
  });
}

async function init() {
  await startCamera();

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
  );

  const faceLandmarker = await FaceLandmarker.createFromOptions(
    vision,
    {
      baseOptions: {
        modelAssetPath:
          "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task"
      },
      runningMode: "VIDEO",
      numFaces: 1
    }
  );

  const handLandmarker = await HandLandmarker.createFromOptions(
    vision,
    {
      baseOptions: {
        modelAssetPath:
          "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task"
      },
      runningMode: "VIDEO",
      numHands: 2
    }
  );

  function drawPoint(x, y, color = "lime", size = 5) {
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }

  function drawLine(a, b, color = "cyan") {
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  const fingertipIndices = [4, 8, 12, 16, 20];

  async function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const now = performance.now();

    const faceResult = faceLandmarker.detectForVideo(video, now);
    const handResult = handLandmarker.detectForVideo(video, now);

    // Face mesh
    if (faceResult.faceLandmarks) {
      faceResult.faceLandmarks.forEach(face => {
        face.forEach(point => {
          drawPoint(
            point.x * canvas.width,
            point.y * canvas.height,
            "white",
            1
          );
        });

        for (let i = 0; i < face.length - 1; i++) {
          drawLine(
            {
              x: face[i].x * canvas.width,
              y: face[i].y * canvas.height
            },
            {
              x: face[i + 1].x * canvas.width,
              y: face[i + 1].y * canvas.height
            },
            "cyan"
          );
        }
      });
    }

    // Hand skeletons
    if (handResult.landmarks) {
      handResult.landmarks.forEach(hand => {

        const connections = [
          [0,1],[1,2],[2,3],[3,4],
          [0,5],[5,6],[6,7],[7,8],
          [0,9],[9,10],[10,11],[11,12],
          [0,13],[13,14],[14,15],[15,16],
          [0,17],[17,18],[18,19],[19,20]
        ];

        connections.forEach(([a,b]) => {
          drawLine(
            {
              x: hand[a].x * canvas.width,
              y: hand[a].y * canvas.height
            },
            {
              x: hand[b].x * canvas.width,
              y: hand[b].y * canvas.height
            },
            "yellow"
          );
        });

        hand.forEach((p, index) => {
          const isFingerTip = fingertipIndices.includes(index);

          drawPoint(
            p.x * canvas.width,
            p.y * canvas.height,
            isFingerTip ? "lime" : "red",
            isFingerTip ? 8 : 4
          );
        });
      });
    }

    requestAnimationFrame(render);
  }

  render();
}

init();
