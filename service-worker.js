// Copyright 2023 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     https://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

let startRec = true;
let stopRec = false;

chrome.action.onClicked.addListener(async (tab) => {
  const existingContexts = await chrome.runtime.getContexts({});
  let recording = false;

  const offscreenDocument = existingContexts.find(
    (c) => c.contextType === 'OFFSCREEN_DOCUMENT',
  );

  // If an offscreen document is not already open, create one.
  if (!offscreenDocument) {
    // Create an offscreen document.
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['USER_MEDIA'],
      justification: 'Recording from chrome.tabCapture API',
    });
  } else {
    recording = offscreenDocument.documentUrl.endsWith('#recording');
  }

  if (recording) {
    stopRec = true;
    chrome.runtime.sendMessage({
      type: 'stop-recording',
      target: 'offscreen',
    });
    chrome.action.setIcon({ path: 'icons/not-recording.png' });
    return;
  }

  // Get a MediaStream for the active tab.
  const streamId = await chrome.tabCapture.getMediaStreamId({
    targetTabId: tab.id,
  });

  // Send the stream ID to the offscreen document to start recording.
  chrome.runtime.sendMessage({
    type: 'start-recording',
    target: 'offscreen',
    data: streamId,
  });

  chrome.action.setIcon({ path: '/icons/recording.png' });
});

const mimeType = 'audio/webm; codecs=pcm';
const LOCAL_SERVER_ENDPOINT = 'http://localhost:8021/v1/transcriber';

chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  switch (message.contentScriptQuery) {
    case 'upload-chunk':
      // const blob = await fetch(message.data.blob).then((res) => res.blob());

      // const chunk = new Uint8Array(blob);
      // const audioFile = new File([blob], 'file.webm', {
      //   type: mimeType,
      // });

      let endpoint = 'chunk';
      if (stopRec) {
        endpoint = 'stop';
        startRec = true;
        stopRec = false;
      } else if (startRec) {
        endpoint = 'start';
        startRec = false;
        console.log('Start recording');
      }

      fetch(`${LOCAL_SERVER_ENDPOINT}/upload-${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // 'Content-Type': mimeType,
          // 'Authorization': 'Bearer ' + config.SBER_ACCESS_TOKEN,
          // 'X-Framerate': MediaRecorder.audioBitsPerSecond,
        },
        body: JSON.stringify({
          chunk: message.data.blob,
        }),
      })
        .then((response) => {
          return response.json();
        })
        .then((data) => {
          console.log('Transcription: ', data);
        })
        .catch(console.error);
      break;
  }
  return true;
});
