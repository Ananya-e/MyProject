const API_BASE=window.API_BASE||"http://127.0.0.1:5000";

document.addEventListener("DOMContentLoaded",()=>{

const startBtn=document.getElementById("startInterviewBtn");
const voiceStartBtn=document.getElementById("startVoiceInterviewBtn");
const toast=document.getElementById("toast");
const userName=document.getElementById("userName");
const userAvatar=document.getElementById("userAvatar");
const resumeStatus=document.getElementById("resumeStatus");
const resumeName=document.getElementById("resumeName");
const resumeState=document.getElementById("resumeState");
const resumeFileInput=document.getElementById("resumeFileInput");
const typeCards=document.querySelectorAll(".type-card");
const questionButtons=document.querySelectorAll(".question-options button");
const targetRole=document.getElementById("targetRole");
const experienceLevel=document.getElementById("experienceLevel");
const questionCountText=document.getElementById("questionCountText");
const timeText=document.getElementById("timeText");

let selectedType="technical";
let selectedCount=15;
let selectedMode="text";
let activeResume=null;
let uploadingResume=false;

function showToast(message){
if(!toast)return;

toast.textContent=message;
toast.classList.add("show");

setTimeout(()=>{
toast.classList.remove("show");
},3000);
}

function getUser(){
try{
return JSON.parse(
localStorage.getItem("user")||"null"
);
}catch{
return null;
}
}

function loadUser(){
const user=getUser();

const name=
localStorage.getItem("user_name")||
user?.name||
user?.full_name||
"Candidate";

if(userName){
userName.textContent=name;
}

if(userAvatar){
userAvatar.textContent=
name.charAt(0).toUpperCase();
}
}

async function loadResume(){
const userId=localStorage.getItem("user_id");

if(!userId){
return;
}

try{
const response=await fetch(
`${API_BASE}/api/dashboard`,
{
method:"POST",
headers:{
"Content-Type":"application/json"
},
body:JSON.stringify({
user_id:userId
})
}
);

const data=await response.json();

if(!response.ok||data.error){
throw new Error(
data.error||
"Unable to check your resume."
);
}

activeResume=data.resume||null;

renderResumeStatus();

}catch(error){

console.error(
"Resume check error:",
error
);

if(resumeName){
resumeName.textContent="No resume uploaded";
}

if(resumeState){
resumeState.textContent="Upload a resume first";
resumeState.style.color="#d83a3a";
}
}
}

function renderResumeStatus(){

if(!activeResume){

if(resumeName){
resumeName.textContent="No resume uploaded";
}

if(resumeState){
resumeState.textContent="Upload a resume first";
resumeState.style.color="#d83a3a";
}

if(resumeStatus){
resumeStatus.classList.add("resume-missing");
}

return;
}

if(resumeName){
resumeName.textContent=
activeResume.file_name||
"Analyzed Resume";
}

if(resumeState){
resumeState.textContent="Analyzed";
resumeState.style.color="#23a567";
}

if(resumeStatus){
resumeStatus.classList.remove("resume-missing");
resumeStatus.classList.add("resume-ready");
}
}

function updateQuestionInfo(){

if(questionCountText){
questionCountText.textContent=
`${selectedCount} ${selectedMode==="voice"?"minutes":"questions"}`;
}

const normalTimes={
5:"10–15 minutes",
10:"20–25 minutes",
15:"30–40 minutes"
};

if(timeText){
timeText.textContent=
selectedMode==="voice"
? `Voice interview: ${selectedCount} minutes`
:`Estimated time: ${normalTimes[selectedCount]}`;
}
}

function isSupportedFile(file){

if(!file){
return false;
}

const name=file.name.toLowerCase();

return name.endsWith(".pdf")||
name.endsWith(".docx");
}

async function uploadResume(file){

if(uploadingResume){
return;
}

if(!file){
return;
}

if(!isSupportedFile(file)){

showToast(
"Please upload a PDF or DOCX file."
);

if(resumeFileInput){
resumeFileInput.value="";
}

return;
}

const userId=localStorage.getItem("user_id");

if(!userId){

showToast(
"Please login again."
);

return;
}

uploadingResume=true;

if(resumeName){
resumeName.textContent=file.name;
}

if(resumeState){
resumeState.textContent="Analyzing resume...";
resumeState.style.color="#6842e8";
}

if(startBtn){
startBtn.disabled=true;
}

if(voiceStartBtn){
voiceStartBtn.disabled=true;
}

showToast(
"Analyzing your resume..."
);

const formData=new FormData();

formData.append(
"resume",
file
);

formData.append(
"user_id",
userId
);

try{

const response=await fetch(
`${API_BASE}/api/resume/parse`,
{
method:"POST",
body:formData
}
);

const data=await response.json();

if(!response.ok||!data.success){

throw new Error(
data.error||
"Resume analysis failed."
);
}

activeResume=
data.saved_resume||{
file_name:file.name,
parsed_data:data.resume
};

if(
activeResume&&
!activeResume.parsed_data
){
activeResume.parsed_data=
data.resume;
}

renderResumeStatus();

showToast(
"Resume analyzed successfully."
);

}catch(error){

console.error(
"Resume upload error:",
error
);

activeResume=null;

if(resumeName){
resumeName.textContent=
"No resume uploaded";
}

if(resumeState){
resumeState.textContent=
"Upload a resume first";
resumeState.style.color=
"#d83a3a";
}

showToast(
error.message||
"Unable to analyze the resume."
);

}finally{

uploadingResume=false;

if(startBtn){
startBtn.disabled=false;
}

if(voiceStartBtn){
voiceStartBtn.disabled=false;
}

if(resumeFileInput){
resumeFileInput.value="";
}
}
}

typeCards.forEach(card=>{

card.addEventListener(
"click",
()=>{

typeCards.forEach(
item=>{
item.classList.remove("selected");
}
);

card.classList.add("selected");

selectedType=
card.dataset.type;
}
);

});

questionButtons.forEach(button=>{

button.addEventListener(
"click",
()=>{

questionButtons.forEach(
item=>{
item.classList.remove("selected");
}
);

button.classList.add("selected");

selectedCount=
Number(button.dataset.count);

updateQuestionInfo();
}
);

});

resumeStatus?.addEventListener(
"click",
()=>{

if(uploadingResume){
return;
}

if(resumeFileInput){
resumeFileInput.value="";
resumeFileInput.click();
}
}
);

resumeFileInput?.addEventListener(
"change",
event=>{

const file=
event.target.files?.[0];

if(!file){
return;
}

uploadResume(file);
}
);

async function startInterview(destination){

const selectedButton=document.querySelector(".question-options button.selected");

const selectedValue=
Number(selectedButton?.dataset.count)||selectedCount;

selectedMode=
destination==="voice"
?"voice"
:"text";

selectedCount=selectedValue;

updateQuestionInfo();

const userId=
localStorage.getItem("user_id");

if(!userId){

showToast(
"Please login again."
);

return;
}

if(!activeResume){

showToast(
"Please upload and analyze your resume first."
);

if(resumeFileInput){
resumeFileInput.value="";
resumeFileInput.click();
}

return;
}

if(
!targetRole?.value||
!experienceLevel?.value
){

showToast(
"Please select your target role and experience level."
);

return;
}

startBtn.disabled=true;

if(voiceStartBtn){
voiceStartBtn.disabled=true;
}

const originalStartText=
startBtn.innerHTML;

const originalVoiceText=
voiceStartBtn?.innerHTML;

if(destination==="voice"){

if(voiceStartBtn){
voiceStartBtn.innerHTML=
'<i class="fa-solid fa-spinner fa-spin"></i><span>Preparing...</span>';
}

}else{

startBtn.innerHTML=
'<i class="fa-solid fa-spinner fa-spin"></i><span>Preparing...</span>';
}

localStorage.setItem(
"target_role",
targetRole.value
);

localStorage.setItem(
"experience_level",
experienceLevel.value
);

try{

const requestBody={
user_id:userId,
target_role:targetRole.value,
experience_level:experienceLevel.value,
interview_type:selectedType,
interview_mode:
destination==="voice"
?"voice"
:"text"
};

if(destination==="voice"){

requestBody.duration_minutes=
selectedValue;

requestBody.question_count=null;

}else{

requestBody.question_count=
selectedValue;

requestBody.duration_minutes=null;
}

console.log(
"Starting interview:",
requestBody
);

const response=await fetch(
`${API_BASE}/api/interview/start`,
{
method:"POST",
headers:{
"Content-Type":"application/json"
},
body:JSON.stringify(requestBody)
}
);

const data=await response.json();

if(!response.ok){

throw new Error(
data.error||
"Unable to start interview."
);
}

console.log(
"Interview created:",
data
);

if(destination==="voice"){

console.log(
"Voice duration:",
data.duration_minutes,
"minutes"
);

if(
Number(data.duration_minutes)!==
selectedValue
){

throw new Error(
`Voice interview duration mismatch. Selected ${selectedValue} minutes but server created ${data.duration_minutes} minutes.`
);
}
}

sessionStorage.setItem(
"current_interview",
JSON.stringify(data)
);

window.location.href=
destination==="voice"
?"voice-interview.html"
:"interview.html";

}catch(error){

console.error(
"Interview start error:",
error
);

showToast(
error.message||
"Unable to start interview."
);

startBtn.disabled=false;

if(voiceStartBtn){
voiceStartBtn.disabled=false;
}

startBtn.innerHTML=
originalStartText;

if(voiceStartBtn){
voiceStartBtn.innerHTML=
originalVoiceText;
}
}
}

startBtn?.addEventListener(
"click",
()=>{
startInterview("text");
}
);

voiceStartBtn?.addEventListener(
"click",
()=>{
startInterview("voice");
}
);

loadUser();
loadResume();
updateQuestionInfo();

});