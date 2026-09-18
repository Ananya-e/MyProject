const API_BASE=window.API_BASE||"http://127.0.0.1:5000";

document.addEventListener("DOMContentLoaded",()=>{

const storedInterviewData=JSON.parse(
sessionStorage.getItem("current_interview")||"null"
);

const interviewData=
storedInterviewData?.interview
?{
...storedInterviewData,
...storedInterviewData.interview
}
:storedInterviewData;

const user=JSON.parse(
localStorage.getItem("user")||"null"
);

const userAvatar=document.getElementById("userAvatar");
const userName=document.getElementById("userName");
const interviewTimer=document.getElementById("interviewTimer");
const targetRole=document.getElementById("targetRole");
const interviewType=document.getElementById("interviewType");
const connectionStatus=document.getElementById("connectionStatus");
const connectionIndicator=document.getElementById("connectionIndicator");
const aiStatus=document.getElementById("aiStatus");
const candidateStatus=document.getElementById("candidateStatus");
const micBtn=document.getElementById("micBtn");
const micStatus=document.getElementById("micStatus");
const micHint=document.getElementById("micHint");
const progressText=document.getElementById("progressText");
const progressFill=document.getElementById("progressFill");
const progressHint=document.getElementById("progressHint");
const toast=document.getElementById("toast");
const endInterviewBtn=document.getElementById("endInterviewBtn");
const endOverlay=document.getElementById("endOverlay");
const cancelEndBtn=document.getElementById("cancelEndBtn");
const confirmEndBtn=document.getElementById("confirmEndBtn");

let socket=null;
let audioContext=null;
let mediaStream=null;
let sourceNode=null;
let processorNode=null;
let outputContext=null;
let nextAudioTime=0;
let timerInterval=null;
let secondsElapsed=0;
let durationSeconds=0;
let recording=false;
let interviewEnded=false;
let finishing=false;
let endingForTimeout=false;
let endingManually=false;
let waitingForClosingAudio=false;
let closingFallbackTimer=null;
let transcript=[];
let closingStartedAt=null;
let closingTimerInterval=null;
let closingAudioFinished=false;
let timerReachedZero=false;

if(!interviewData||!interviewData.id){

showToast(
"Interview session not found."
);

setTimeout(
()=>window.location.href="practice.html",
1500
);

return;
}

const interviewId=interviewData.id;

function showToast(message){

if(!toast)return;

toast.textContent=message;
toast.classList.add("show");

setTimeout(
()=>toast.classList.remove("show"),
3000
);
}

function setText(element,value){

if(element){
element.textContent=value;
}
}

function loadUser(){

const name=
localStorage.getItem("user_name")||
user?.name||
user?.full_name||
"Candidate";

setText(
userName,
name
);

setText(
userAvatar,
name.charAt(0).toUpperCase()
);
}

function formatTime(totalSeconds){

const safe=Math.max(
0,
Math.floor(totalSeconds)
);

const minutes=Math.floor(
safe/60
);

const seconds=safe%60;

return `${String(minutes).padStart(2,"0")}:${String(seconds).padStart(2,"0")}`;
}

function loadInterview(){

const role=
localStorage.getItem("target_role")||
interviewData.target_role||
"-";

const type=
interviewData.interview_type||
"Interview";

const selectedDuration=
Number(
interviewData.duration_minutes
);

if(
!selectedDuration||
![5,10,15].includes(selectedDuration)
){

showToast(
"Invalid voice interview duration."
);

setTimeout(
()=>window.location.href="practice.html",
1500
);

return false;
}

durationSeconds=
selectedDuration*60;

setText(
targetRole,
role
);

setText(
interviewType,
type
);

setText(
interviewTimer,
formatTime(durationSeconds)
);

setText(
progressText,
formatTime(durationSeconds)
);

setText(
progressHint,
`${selectedDuration} minute voice interview`
);

if(progressFill){
progressFill.style.width="0%";
}

return true;
}

function startTimer(){

if(timerInterval){
clearInterval(timerInterval);
}

const startedAt=Date.now();

secondsElapsed=0;

timerInterval=setInterval(
()=>{

if(
finishing||
interviewEnded
){
return;
}

if(
endingForTimeout||
endingManually
){
return;
}

secondsElapsed=
Math.floor(
(Date.now()-startedAt)/1000
);

const remaining=
Math.max(
0,
durationSeconds-secondsElapsed
);

setText(
interviewTimer,
formatTime(remaining)
);

setText(
progressText,
formatTime(remaining)
);

if(progressFill){

const elapsedPercent=
Math.min(
100,
Math.round(
(secondsElapsed/durationSeconds)*100
)
);

progressFill.style.width=
`${elapsedPercent}%`;
}

if(
remaining<=15&&
!endingForTimeout
){

beginTimedEnding();
}

},
250
);
}

function beginTimedEnding(){

if(
endingForTimeout||
endingManually||
finishing||
interviewEnded
){
return;
}

endingForTimeout=true;

if(timerInterval){
clearInterval(timerInterval);
timerInterval=null;
}

setAIStatus(
"Wrapping up the interview"
);

setCandidateStatus(
"AI is giving the closing message..."
);

setText(
micHint,
"Your interview is wrapping up."
);

// Requirement: the application must stop accepting candidate input
// once the final 15 seconds begin.
stopMicrophone();

waitingForClosingAudio=true;

startClosingCountdown();

sendClosingMessage(true);
}

function startClosingCountdown(){

if(closingTimerInterval){
clearInterval(closingTimerInterval);
}

closingStartedAt=Date.now();

const closingDuration=15;

setText(
interviewTimer,
formatTime(closingDuration)
);

setText(
progressText,
formatTime(closingDuration)
);

if(progressFill){
progressFill.style.width="100%";
}

closingTimerInterval=setInterval(
()=>{

const elapsed=
Math.floor(
(Date.now()-closingStartedAt)/1000
);

const remaining=
Math.max(
0,
closingDuration-elapsed
);

setText(
interviewTimer,
formatTime(remaining)
);

setText(
progressText,
formatTime(remaining)
);

if(remaining<=0){

clearInterval(
closingTimerInterval
);

closingTimerInterval=null;

timerReachedZero=true;

setText(
interviewTimer,
"00:00"
);

setText(
progressText,
"00:00"
);

if(progressFill){
progressFill.style.width="100%";
}

checkClosingComplete();
}

},
100
);
}

function checkClosingComplete(){

if(
!timerReachedZero||
!closingAudioFinished
){
return;
}

completeInterviewAfterClosing();
}

function setConnection(connected){

if(connected){

setText(
connectionStatus,
"Connected"
);

if(connectionIndicator){
connectionIndicator.classList.add(
"connected"
);
}

}else{

setText(
connectionStatus,
"Disconnected"
);

if(connectionIndicator){
connectionIndicator.classList.remove(
"connected"
);
}
}
}

function setAIStatus(message){

setText(
aiStatus,
message
);
}

function setCandidateStatus(message){

setText(
candidateStatus,
message
);
}

function connectSocket(){

const protocol=
window.location.protocol==="https:"
?"wss"
:"ws";

const host=
window.location.hostname==="localhost"||
window.location.hostname==="127.0.0.1"
?"127.0.0.1:5000"
:window.location.host;

const url=
`${protocol}://${host}/ws/voice-interview/${interviewId}`;

console.log(
"VOICE: Connecting to",
url
);

socket=new WebSocket(url);

socket.onopen=async()=>{

console.log(
"VOICE: WebSocket connected"
);

setConnection(true);

setAIStatus(
"AI Interviewer is ready"
);

await startMicrophone();

if(recording){
startTimer();
sendSessionContext();
}
};

socket.onmessage=async event=>{

try{

let message=event.data;

if(message instanceof Blob){
message=await message.text();
}

if(message instanceof ArrayBuffer){
message=
new TextDecoder().decode(message);
}

if(typeof message!=="string"){
return;
}

const data=
JSON.parse(message);

if(data.error){

console.error(
"VOICE ERROR: Gemini:",
data.error
);

if(
!interviewEnded&&
!finishing
){

showToast(
data.error.message||
"Gemini Live error."
);
}

return;
}

if(!data.serverContent){
return;
}

const content=
data.serverContent;

if(content.inputTranscription?.text){

const text=
content.inputTranscription.text.trim();

if(text){

transcript.push({
speaker:"candidate",
role:"candidate",
text:text,
time:new Date().toISOString()
});

setCandidateStatus(
"Answer received"
);
}
}

if(content.outputTranscription?.text){

const text=
content.outputTranscription.text.trim();

if(text){

transcript.push({
speaker:"ai",
role:"interviewer",
text:text,
time:new Date().toISOString()
});

setAIStatus(
"AI Interviewer"
);
}
}

if(content.modelTurn?.parts){

for(
const part
of content.modelTurn.parts
){

if(part.inlineData?.data){

closingAudioFinished=false;

playAudio(
part.inlineData.data
);
}
}
}

if(content.turnComplete){

setCandidateStatus(
"Listening..."
);

if(waitingForClosingAudio){

waitForClosingAudioToFinish();
}
}

}catch(error){

console.error(
"VOICE ERROR: Message handling:",
error
);
}
};

socket.onerror=()=>{

console.error(
"VOICE: WebSocket error"
);

setConnection(false);

if(
!interviewEnded&&
!finishing&&
!waitingForClosingAudio
){

showToast(
"Voice connection error."
);
}
};

socket.onclose=()=>{

console.log(
"VOICE: WebSocket closed"
);

setConnection(false);

if(
!interviewEnded&&
!finishing&&
!waitingForClosingAudio
){

setAIStatus(
"Connection ended"
);
}
};
}

function sendSessionContext(){

if(
!socket||
socket.readyState!==WebSocket.OPEN
){
return;
}

const role=
localStorage.getItem("target_role")||
interviewData.target_role||
"";

const experience=
localStorage.getItem("experience_level")||
interviewData.experience_level||
"";

const type=
interviewData.interview_type||
"";

const minutes=
Number(
interviewData.duration_minutes
);

const context={
interview_id:interviewId,
target_role:role,
experience_level:experience,
interview_type:type,
duration_minutes:minutes,
resume:interviewData.resume||null
};

socket.send(
JSON.stringify({
realtimeInput:{
text:`Interview configuration: ${JSON.stringify(context)}.

Start the interview immediately.

You are conducting a ${minutes}-minute live voice interview for a ${role} candidate at ${experience} level.

Ask the first interview question now.

Do not use a fixed question list.

Decide each next question naturally from the candidate's previous answer.

Ask one question at a time.

Wait for the candidate to finish speaking before continuing.

Keep the interview conversational and realistic.

Do not mention question numbers.

Do not tell the candidate their scores.

Use the candidate's resume and selected interview type to guide the interview.

Use follow-up questions when appropriate.

The interview has a strict ${minutes}-minute time limit.

IMPORTANT:
Do not end the interview early because you think the time is almost over.
Do not announce that the interview has ended while there is still time remaining.
Continue asking relevant questions naturally until the application explicitly tells you that the final 15-second closing period has started.
Do not use question numbers.
Do not count questions.
If the candidate pauses or hesitates, wait patiently and allow them to continue speaking.
If the user sounds like they are done answering, you may ask a follow-up question or move on to the next question.
If the user asks a question, answer it briefly and then continue with the interview.
If the user sounds nervous or unsure, reassure them and continue with the interview.
If the user asks for a break, allow them to take a short break and then continue with the interview.
Do not give a break if the user asks for a break at the start of the interview. Instead tell them to start the interview and you can allow a break later if needed.
If the candidate says they want to stop or end the interview early, tell them they can use the "End Interview" button whenever they are ready, and continue the interview normally until they do. Do not treat this as a request to end the interview yourself.
Be professional, encouraging, and supportive throughout the interview.
The application controls the interview timer.

Only when the application explicitly sends the final 15-second closing instruction should you stop asking questions and give the final closing statement.`
}
})
);
}

async function startMicrophone(){

try{

mediaStream=
await navigator.mediaDevices.getUserMedia({
audio:{
channelCount:1,
echoCancellation:true,
noiseSuppression:true,
autoGainControl:true
}
});

audioContext=
new AudioContext({
sampleRate:16000
});

if(
audioContext.state==="suspended"
){

await audioContext.resume();
}

sourceNode=
audioContext.createMediaStreamSource(
mediaStream
);

await audioContext.audioWorklet.addModule(
"js/pcm-processor.js"
);

processorNode=
new AudioWorkletNode(
audioContext,
"pcm-processor"
);

processorNode.port.onmessage=
event=>{

if(
!recording||
!socket||
socket.readyState!==WebSocket.OPEN||
interviewEnded||
finishing||
endingForTimeout||
endingManually
){
return;
}

const base64=
uint8ToBase64(
new Uint8Array(event.data)
);

socket.send(
JSON.stringify({
realtimeInput:{
audio:{
data:base64,
mimeType:"audio/pcm;rate=16000"
}
}
})
);
};

sourceNode.connect(
processorNode
);

const muteGain=
audioContext.createGain();

muteGain.gain.value=0;

processorNode.connect(
muteGain
);

muteGain.connect(
audioContext.destination
);

recording=true;

setCandidateStatus(
"Listening..."
);

setText(
micStatus,
"Microphone active"
);

setText(
micHint,
"Speak naturally. The AI will respond when you finish."
);

if(micBtn){
micBtn.classList.add("active");
}

}catch(error){

console.error(
"Microphone error:",
error
);

showToast(
"Microphone permission is required for the voice interview."
);

setCandidateStatus(
"Microphone unavailable"
);
}
}

function convertFloat32ToPCM(input){

const output=
new Int16Array(
input.length
);

for(
let i=0;
i<input.length;
i++
){

const sample=
Math.max(
-1,
Math.min(
1,
input[i]
)
);

output[i]=
sample<0
?sample*32768
:sample*32767;
}

return output.buffer;
}

function uint8ToBase64(bytes){

let binary="";

const chunkSize=0x8000;

for(
let i=0;
i<bytes.length;
i+=chunkSize
){

binary+=String.fromCharCode(
...bytes.subarray(
i,
i+chunkSize
)
);
}

return btoa(binary);
}

function playAudio(base64){

try{

if(!outputContext){

outputContext=
new AudioContext({
sampleRate:24000
});
}

if(
outputContext.state==="suspended"
){

outputContext.resume().catch(
()=>{}
);
}

const binary=
atob(base64);

const bytes=
new Uint8Array(
binary.length
);

for(
let i=0;
i<binary.length;
i++
){

bytes[i]=
binary.charCodeAt(i);
}

const pcm=
new Int16Array(
bytes.buffer
);

const buffer=
outputContext.createBuffer(
1,
pcm.length,
24000
);

const channel=
buffer.getChannelData(0);

for(
let i=0;
i<pcm.length;
i++
){

channel[i]=
pcm[i]/32768;
}

const source=
outputContext.createBufferSource();

source.buffer=buffer;

source.connect(
outputContext.destination
);

const now=
outputContext.currentTime;

nextAudioTime=
Math.max(
nextAudioTime,
now
);

source.start(
nextAudioTime
);

nextAudioTime+=
buffer.duration;

setAIStatus(
"AI is speaking"
);

if(waitingForClosingAudio){

closingAudioFinished=false;

const expectedFinish=
nextAudioTime;

setTimeout(
()=>{
if(
outputContext&&
outputContext.currentTime>=expectedFinish
){

closingAudioFinished=true;

checkClosingComplete();
}
},
Math.max(
0,
(expectedFinish-outputContext.currentTime)*1000
)+100
);
}

}catch(error){

console.error(
"Audio playback error:",
error
);

if(waitingForClosingAudio){

closingAudioFinished=true;

checkClosingComplete();
}
}
}

function stopMicrophone(){

recording=false;

if(processorNode){

processorNode.disconnect();

processorNode=null;
}

if(sourceNode){

sourceNode.disconnect();

sourceNode=null;
}

if(mediaStream){

mediaStream
.getTracks()
.forEach(
track=>track.stop()
);

mediaStream=null;
}

if(audioContext){

audioContext
.close()
.catch(
()=>{}
);

audioContext=null;
}

if(micBtn){

micBtn.classList.remove(
"active"
);
}

setText(
micStatus,
"Microphone off"
);
}

async function beginManualEnding(){

if(
endingManually||
finishing||
interviewEnded
){
return;
}

endingManually=true;
interviewEnded=true;

if(timerInterval){
clearInterval(timerInterval);
timerInterval=null;
}

if(closingTimerInterval){
clearInterval(closingTimerInterval);
closingTimerInterval=null;
}

if(closingFallbackTimer){
clearTimeout(closingFallbackTimer);
closingFallbackTimer=null;
}

stopMicrophone();

setAIStatus(
"Ending interview"
);

setCandidateStatus(
"Interview ended"
);

setText(
micHint,
"Returning to Practice Interview..."
);

if(endInterviewBtn){
endInterviewBtn.disabled=true;
}

if(confirmEndBtn){
confirmEndBtn.disabled=true;
}

if(socket){
try{
socket.close();
}catch(error){}
socket=null;
}

try{

const response=await fetch(
`${API_BASE}/api/interview/cancel`,
{
method:"POST",
headers:{
"Content-Type":"application/json"
},
body:JSON.stringify({
user_id:localStorage.getItem("user_id"),
interview_id:interviewId
})
}
);

const data=await response.json();

console.log(
"VOICE: Interview cancelled",
data
);

}catch(error){

console.error(
"VOICE: Cancel request failed:",
error
);

}

sessionStorage.removeItem(
"current_interview"
);

window.location.href="practice.html";
}

function sendClosingMessage(timedOut){

if(
!socket||
socket.readyState!==WebSocket.OPEN
){

if(timedOut){

timerReachedZero=true;
closingAudioFinished=true;
checkClosingComplete();

}else{

completeInterviewAfterClosing();
}

return;
}

const closingPrompt=
timedOut
?`The final 15 seconds of the interview have now started.

Stop asking interview questions.

Give the candidate a very short, warm and professional closing statement.

Do not ask any questions.

Do not start a new topic.

Tell the candidate that the interview is wrapping up and thank them for their time.

Keep the entire closing to one or two short sentences and under approximately 8 seconds.

Speak the closing statement aloud now.`
:`The candidate has chosen to end the interview.

Do not ask another question.

Give the candidate a short, warm and professional closing message.

Thank them for their time and explain that their responses will now be evaluated.

Keep the closing to one or two short sentences.

Speak the closing message aloud now.`;

socket.send(
JSON.stringify({
realtimeInput:{
audioStreamEnd:true
}
})
);

socket.send(
JSON.stringify({
realtimeInput:{
text:closingPrompt
}
})
);

if(closingFallbackTimer){

clearTimeout(
closingFallbackTimer
);
}

closingFallbackTimer=
setTimeout(
()=>{

if(timedOut){

closingAudioFinished=true;
checkClosingComplete();

}else{

completeInterviewAfterClosing();
}

},
9000
);
}

function waitForClosingAudioToFinish(){

if(!waitingForClosingAudio){
return;
}

if(closingFallbackTimer){

clearTimeout(
closingFallbackTimer
);

closingFallbackTimer=null;
}

if(
!outputContext||
nextAudioTime<=outputContext.currentTime
){

closingAudioFinished=true;

checkClosingComplete();

return;
}

const audioWait=
Math.max(
0,
(nextAudioTime-outputContext.currentTime)*1000
);

setTimeout(
()=>{

closingAudioFinished=true;

checkClosingComplete();

},
audioWait+150
);
}

function completeInterviewAfterClosing(){

if(
finishing||
interviewEnded
){
return;
}

if(
endingForTimeout&&
(!timerReachedZero||!closingAudioFinished)
){
return;
}

if(closingFallbackTimer){

clearTimeout(
closingFallbackTimer
);

closingFallbackTimer=null;
}

waitingForClosingAudio=false;

finishInterview();
}

async function finishInterview(){

if(
finishing||
interviewEnded
){
return;
}

finishing=true;
interviewEnded=true;

if(timerInterval){

clearInterval(
timerInterval
);

timerInterval=null;
}

if(closingTimerInterval){

clearInterval(
closingTimerInterval
);

closingTimerInterval=null;
}

stopMicrophone();

setText(
interviewTimer,
"00:00"
);

setText(
progressText,
"00:00"
);

setAIStatus(
"Preparing your results..."
);

setCandidateStatus(
"Evaluating your interview..."
);

if(endInterviewBtn){
endInterviewBtn.disabled=true;
}

if(confirmEndBtn){
confirmEndBtn.disabled=true;
}

if(socket){

try{
socket.close();
}catch(error){}

socket=null;
}

const actualDuration=
endingForTimeout
?durationSeconds
:Math.min(
secondsElapsed,
durationSeconds
);

try{

console.log(
"VOICE: Completing interview",
{
interview_id:interviewId,
user_id:localStorage.getItem("user_id"),
duration_seconds:actualDuration,
transcript_count:transcript.length
}
);

const response=
await fetch(
`${API_BASE}/api/voice-interview/complete`,
{
method:"POST",
headers:{
"Content-Type":"application/json"
},
body:JSON.stringify({
interview_id:interviewId,
user_id:localStorage.getItem("user_id"),
transcript:transcript,
duration_seconds:actualDuration
})
}
);

const data=
await response.json();

console.log(
"VOICE: Completion response",
data
);

if(!response.ok){

throw new Error(
data.error||
"Unable to complete interview."
);
}

sessionStorage.setItem(
"interview_result",
JSON.stringify(data)
);

sessionStorage.removeItem(
"current_interview"
);

window.location.href=
`result.html?interview_id=${encodeURIComponent(interviewId)}`;

}catch(error){

console.error(
"Interview completion error:",
error
);

finishing=false;
interviewEnded=false;

if(endInterviewBtn){
endInterviewBtn.disabled=false;
}

if(confirmEndBtn){
confirmEndBtn.disabled=false;
}

showToast(
error.message||
"Unable to complete interview."
);
}
}

micBtn?.addEventListener(
"click",
()=>{

if(
interviewEnded||
finishing||
endingForTimeout||
endingManually
){
return;
}

if(!recording){

startMicrophone();

return;
}

stopMicrophone();

setCandidateStatus(
"Paused"
);
}
);

endInterviewBtn?.addEventListener(
"click",
()=>{

if(
interviewEnded||
finishing||
endingForTimeout||
endingManually
){
return;
}

endOverlay?.classList.add(
"show"
);
}
);

cancelEndBtn?.addEventListener(
"click",
()=>{

if(
finishing||
endingForTimeout||
endingManually
){
return;
}

endOverlay?.classList.remove(
"show"
);
}
);

confirmEndBtn?.addEventListener(
"click",
()=>{

if(
finishing||
interviewEnded||
endingForTimeout||
endingManually
){
return;
}

endOverlay?.classList.remove(
"show"
);

beginManualEnding();
}
);

window.addEventListener(
"beforeunload",
()=>{

stopMicrophone();

if(socket){
socket.close();
}
});

loadUser();

const interviewLoaded=
loadInterview();

if(!interviewLoaded){
return;
}

connectSocket();

});