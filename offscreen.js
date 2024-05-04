chrome.runtime.onMessage.addListener(async (message) => {
  if (message.target === 'offscreen') {
    switch (message.type) {
      case 'start-recording':
        startRecording(message.data);
        break;
      case 'stop-recording':
        stopRecording();
        break;
      default:
        throw new Error('Unrecognized message:', message.type);
    }
  }
});

let interval;
let recorder;
let data = [];
let config = {};

const mimeType = 'audio/webm; codecs=opus';

// Function to fetch and parse the config file
function loadConfig() {
  fetch('config.json')
    .then((response) => response.json())
    .then((data) => {
      console.log('Configuration loaded:', data);
      config = data;
    })
    .catch((error) => console.error('Error loading configuration:', error));
}

async function startRecording(streamId) {
  loadConfig();
  if (recorder?.state === 'recording') {
    throw new Error('Called startRecording while recording is in progress.');
  }

  const media = await navigator.mediaDevices.getUserMedia({
    audio: {
      mandatory: {
        chromeMediaSource: 'tab',
        chromeMediaSourceId: streamId,
      },
    },
  });

  // Continue to play the captured audio to the user.
  const output = new AudioContext();
  const source = output.createMediaStreamSource(media);
  source.connect(output.destination);

  // const microphone = await navigator.mediaDevices.getUserMedia({audio: true});

  // const mixedContext = new AudioContext();
  // const mixedDest = mixedContext.createMediaStreamDestination();

  // mixedContext.createMediaStreamSource(microphone).connect(mixedDest);
  // mixedContext.createMediaStreamSource(media).connect(mixedDest);

  // const combinedStream = new MediaStream([
  //   mixedDest.stream.getTracks()[0]
  // ]);

  const currentDate = new Date().toLocaleString('en-US', { timeZone: 'UTC' });
  const transcript_title = 'Transcript ' + currentDate;
  if (recorder?.state === 'recording') {
    throw new Error('Called startRecording while recording is in progress.');
  }

  // Start recording.
  recorder = new MediaRecorder(media, {
    mimeType,
    audioBitsPerSecond: 16000,
  });
  recorder.ondataavailable = (event) => {
    console.log('sending chunk', recorder.audioBitsPerSecond);
    data.push(event.data);
    const reader = new FileReader();
    reader.readAsDataURL(event.data);
    reader.onloadend = function () {
      // let bytes = new Uint8Array(reader.result);
      // var blob = btoa(
      //   bytes.reduce((data, byte) => data + String.fromCharCode(byte), ''),
      // );
      const blob = reader.result.replace(
        'data:audio/webm;codecs=opus;base64,',
        '',
      );
      chrome.runtime.sendMessage({
        contentScriptQuery: 'upload-chunk',
        data: {
          blob,
          // stop: interval === undefined,
        },
      });
    };
  };
  recorder.onstop = () => {
    recorder = undefined;

    // if (interval) {
    //   clearInterval(interval);
    //   interval = undefined;
    // }

    const blob = new Blob(data);
    const url = URL.createObjectURL(blob);

    // Create a new anchor element
    const a = document.createElement('a');

    // Set the href and download attributes for the anchor element
    a.href = url;
    a.download = transcript_title + '.webm'; // You can name the file here

    // Append the anchor to the document
    document.body.appendChild(a);

    // Trigger a click on the anchor to start download
    a.click();

    // Clean up by removing the anchor element and revoking the blob URL
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    console.log('Audio blob saved');
  };
  recorder.start(1000);

  // interval = setInterval(() => {
  //   recorder.requestData();
  // }, 1000);

  console.log('Recording started.', mimeType, recorder.audioBitsPerSecond);

  // Record the current state in the URL. This provides a very low-bandwidth
  // way of communicating with the service worker (the service worker can check
  // the URL of the document and see the current recording state). We can't
  // store that directly in the service worker as it may be terminated while
  // recording is in progress. We could write it to storage but that slightly
  // increases the risk of things getting out of sync.
  window.location.hash = 'recording';
}

async function stopRecording() {
  recorder.stop();

  // Stopping the tracks makes sure the recording icon in the tab is removed.
  recorder.stream.getTracks().forEach((t) => t.stop());

  // Update current state in URL
  window.location.hash = '';

  // Note: In a real extension, you would want to write the recording to a more
  // permanent location (e.g IndexedDB) and then close the offscreen document,
  // to avoid keeping a document around unnecessarily. Here we avoid that to
  // make sure the browser keeps the Object URL we create (see above) and to
  // keep the sample fairly simple to follow.
}
