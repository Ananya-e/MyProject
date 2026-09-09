const API_BASE=window.API_BASE||"http://127.0.0.1:5000";

document.addEventListener("DOMContentLoaded",()=>{

const data=JSON.parse(
sessionStorage.getItem("current_interview")||"null"
);

if(!data||!Array.isArray(data.questions)||!data.questions.length){
window.location.href="practice.html";
return;
}

const questions=data.questions;
let currentIndex=0;
let submitting=false;
let cancelling=false;

const answers=questions.map(question=>{
if(typeof question==="string")return"";
return question.answer||"";
});

const currentQuestion=document.getElementById("currentQuestion");
const totalQuestions=document.getElementById("totalQuestions");
const questionNumber=document.getElementById("questionNumber");
const questionText=document.getElementById("questionText");
const answerInput=document.getElementById("answerInput");
const progressFill=document.getElementById("progressFill");
const previousBtn=document.getElementById("previousBtn");
const nextBtn=document.getElementById("nextBtn");
const answeredCount=document.getElementById("answeredCount");
const questionDots=document.getElementById("questionDots");
const interviewType=document.getElementById("interviewType");
const targetRoleDisplay=document.getElementById("targetRoleDisplay");
const experienceDisplay=document.getElementById("experienceDisplay");
const profileName=document.getElementById("profileName");
const profileAvatar=document.getElementById("profileAvatar");
const cancelBtn=document.getElementById("cancelInterviewBtn");

totalQuestions.textContent=questions.length;

const user=JSON.parse(
localStorage.getItem("user")||"null"
);

const userName=
localStorage.getItem("user_name")||
user?.full_name||
user?.name||
"User";

if(profileName){
profileName.textContent=userName;
}

if(profileAvatar){
profileAvatar.textContent=userName.charAt(0).toUpperCase();
}

const interview=
data.interview||
{};

const interviewId=
interview.id||
data.id||
null;

const type=
interview.interview_type||
data.interview_type||
"FULL MOCK INTERVIEW";

const targetRole=
data.target_role||
interview.target_role||
localStorage.getItem("target_role")||
"Not specified";

const experienceLevel=
data.experience_level||
interview.experience_level||
localStorage.getItem("experience_level")||
"Not specified";

if(interviewType){
interviewType.textContent=
String(type)
.replace(/_/g," ")
.toUpperCase();
}

if(targetRoleDisplay){
targetRoleDisplay.textContent=targetRole;
}

if(experienceDisplay){
experienceDisplay.textContent=experienceLevel;
}

const toast=document.createElement("div");

toast.className="toast";

document.body.appendChild(toast);

let toastTimer=null;

function showToast(message){

clearTimeout(toastTimer);

toast.textContent=message;

toast.classList.add("show");

toastTimer=setTimeout(()=>{
toast.classList.remove("show");
},3000);
}

function getQuestionText(question){

if(typeof question==="string"){
return question;
}

return(
question?.question||
question?.text||
"Question unavailable."
);
}

function saveCurrentAnswer(){

if(!answerInput){
return;
}

const answer=answerInput.value.trim();

answers[currentIndex]=answer;

if(typeof questions[currentIndex]==="object"){
questions[currentIndex].answer=answer;
}

data.questions=questions;

sessionStorage.setItem(
"current_interview",
JSON.stringify(data)
);
}

function updateAnsweredCount(){

const count=
answers.filter(answer=>answer.trim()!=="").length;

if(answeredCount){
answeredCount.textContent=
`${count} answered`;
}
}

function updateProgress(){

if(!progressFill){
return;
}

const progress=
((currentIndex+1)/questions.length)*100;

progressFill.style.width=
`${progress}%`;
}

function renderDots(){

if(!questionDots){
return;
}

questionDots.innerHTML="";

questions.forEach((question,index)=>{

const dot=document.createElement("button");

dot.type="button";

dot.className="question-dot";

if(index===currentIndex){
dot.classList.add("current");
}

if(answers[index].trim()!==""){
dot.classList.add("answered");
}

dot.textContent=index+1;

dot.title=`Question ${index+1}`;

dot.addEventListener("click",()=>{

if(submitting||cancelling){
return;
}

if(index>currentIndex&&!answers[currentIndex].trim()){

showToast(
"Please answer the current question before moving ahead."
);

answerInput?.focus();

return;
}

saveCurrentAnswer();

currentIndex=index;

renderQuestion();

});

questionDots.appendChild(dot);

});
}

function renderQuestion(){

const question=
questions[currentIndex];

if(currentQuestion){
currentQuestion.textContent=
currentIndex+1;
}

if(questionNumber){
questionNumber.textContent=
`Question ${currentIndex+1}`;
}

if(questionText){
questionText.textContent=
getQuestionText(question);
}

if(answerInput){
answerInput.value=
answers[currentIndex]||"";

answerInput.focus();
}

if(previousBtn){
previousBtn.disabled=
currentIndex===0||submitting||cancelling;
}

if(nextBtn){

if(currentIndex===questions.length-1){

nextBtn.innerHTML=
'<span>Submit Interview</span><i class="fa-solid fa-check"></i>';

}else{

nextBtn.innerHTML=
'<span>Next Question</span><i class="fa-solid fa-arrow-right"></i>';
}

nextBtn.disabled=
submitting||
cancelling;
}

updateProgress();
updateAnsweredCount();
renderDots();
}

function createConfirmBox(message,onConfirm){

const overlay=
document.createElement("div");

overlay.className=
"interview-confirm-overlay";

const box=
document.createElement("div");

box.className=
"interview-confirm-box";

box.innerHTML=`
<div class="confirm-icon">
<i class="fa-solid fa-triangle-exclamation"></i>
</div>
<h3>Leave Interview?</h3>
<p>${message}</p>
<div class="confirm-actions">
<button type="button" class="confirm-cancel">Stay</button>
<button type="button" class="confirm-leave">Leave</button>
</div>
`;

overlay.appendChild(box);

document.body.appendChild(overlay);

const stayBtn=
box.querySelector(".confirm-cancel");

const leaveBtn=
box.querySelector(".confirm-leave");

stayBtn?.addEventListener("click",()=>{
overlay.remove();
});

leaveBtn?.addEventListener("click",()=>{
overlay.remove();
onConfirm();
});

overlay.addEventListener("click",event=>{

if(event.target===overlay){
overlay.remove();
}

});

}

async function cancelInterview(){

if(cancelling||submitting){
return;
}

createConfirmBox(
"Your current answers will be lost if you leave this interview.",
async()=>{

if(cancelling){
return;
}

cancelling=true;

if(cancelBtn){
cancelBtn.disabled=true;
}

if(nextBtn){
nextBtn.disabled=true;
}

if(previousBtn){
previousBtn.disabled=true;
}

const userId=
localStorage.getItem("user_id");

if(!userId||!interviewId){

showToast(
"Interview information is missing. Please start a new interview."
);

cancelling=false;

if(cancelBtn){
cancelBtn.disabled=false;
}

return;
}

try{

const response=
await fetch(
`${API_BASE}/api/interview/cancel`,
{
method:"POST",
headers:{
"Content-Type":"application/json"
},
body:JSON.stringify({
user_id:userId,
interview_id:interviewId
})
}
);

const result=
await response.json();

if(!response.ok){

throw new Error(
result.error||
"Unable to cancel the interview."
);
}

sessionStorage.removeItem(
"current_interview"
);

window.location.href=
"practice.html";

}catch(error){

console.error(
"Cancel interview error:",
error
);

cancelling=false;

if(cancelBtn){
cancelBtn.disabled=false;
}

if(nextBtn){
nextBtn.disabled=false;
}

if(previousBtn){
previousBtn.disabled=
currentIndex===0;
}

showToast(
error.message||
"Unable to cancel the interview."
);

}

}
);

}

async function submitInterview(){

if(submitting||cancelling){
return;
}

saveCurrentAnswer();

const unanswered=
answers.filter(
answer=>!answer.trim()
).length;

if(unanswered>0){

showToast(
`Please answer all ${unanswered} remaining question${unanswered===1?"":"s"} before submitting.`
);

const firstUnanswered=
answers.findIndex(
answer=>!answer.trim()
);

if(firstUnanswered!==-1){

currentIndex=
firstUnanswered;

renderQuestion();

answerInput?.focus();

}

return;
}

const userId=
localStorage.getItem("user_id");

if(!userId||!interviewId){

showToast(
"Interview information is missing. Please start a new interview."
);

return;
}

submitting=true;

if(nextBtn){

nextBtn.disabled=true;

nextBtn.innerHTML=
'<i class="fa-solid fa-spinner fa-spin"></i><span>Evaluating...</span>';
}

if(previousBtn){
previousBtn.disabled=true;
}

if(cancelBtn){
cancelBtn.disabled=true;
}

try{

const response=
await fetch(
`${API_BASE}/api/interview/submit`,
{
method:"POST",
headers:{
"Content-Type":"application/json"
},
body:JSON.stringify({
user_id:userId,
interview_id:interviewId,
answers:answers.map(
(answer,index)=>({
question_number:index+1,
answer:answer
})
)
})
}
);

const result=
await response.json();

if(!response.ok){

throw new Error(
result.error||
"Unable to evaluate the interview."
);
}

const completeResult={
...result,
interview:data.interview||{
id:interviewId
},
questions:data.questions,
target_role:targetRole,
experience_level:experienceLevel,
interview_type:
data.interview_type||
data.interview?.interview_type||
type
};

sessionStorage.setItem(
"interview_result",
JSON.stringify(completeResult)
);

sessionStorage.removeItem(
"current_interview"
);

window.location.href=
"result.html";

}catch(error){

console.error(
"Interview evaluation error:",
error
);

submitting=false;

if(nextBtn){

nextBtn.disabled=false;

nextBtn.innerHTML=
'<span>Submit Interview</span><i class="fa-solid fa-check"></i>';
}

if(previousBtn){
previousBtn.disabled=
currentIndex===0;
}

if(cancelBtn){
cancelBtn.disabled=false;
}

showToast(
error.message||
"Unable to evaluate the interview."
);

}

}

answerInput?.addEventListener(
"input",
()=>{

if(submitting||cancelling){
return;
}

answers[currentIndex]=
answerInput.value.trim();

if(typeof questions[currentIndex]==="object"){
questions[currentIndex].answer=
answers[currentIndex];
}

updateAnsweredCount();
renderDots();

}
);

previousBtn?.addEventListener(
"click",
()=>{

if(submitting||cancelling){
return;
}

saveCurrentAnswer();

if(currentIndex>0){

currentIndex--;

renderQuestion();

}

}
);

nextBtn?.addEventListener(
"click",
async()=>{

if(submitting||cancelling){
return;
}

const answer=
answerInput?.value.trim()||"";

if(!answer){

showToast(
"Please answer this question before continuing."
);

answerInput?.focus();

return;
}

saveCurrentAnswer();

if(currentIndex<questions.length-1){

currentIndex++;

renderQuestion();

return;
}

await submitInterview();

}
);

cancelBtn?.addEventListener(
"click",
cancelInterview
);

const menuLinks=
document.querySelectorAll(
".side-menu-nav a"
);

menuLinks.forEach(link=>{

link.addEventListener(
"click",
event=>{

if(submitting||cancelling){
event.preventDefault();
return;
}

event.preventDefault();

createConfirmBox(
"You are currently in an interview. Leaving now will cancel this interview.",
async()=>{

if(cancelling){
return;
}

cancelling=true;

const userId=
localStorage.getItem("user_id");

if(!userId||!interviewId){

showToast(
"Interview information is missing. Please start a new interview."
);

cancelling=false;

return;
}

try{

const response=
await fetch(
`${API_BASE}/api/interview/cancel`,
{
method:"POST",
headers:{
"Content-Type":"application/json"
},
body:JSON.stringify({
user_id:userId,
interview_id:interviewId
})
}
);

const result=
await response.json();

if(!response.ok){

throw new Error(
result.error||
"Unable to cancel the interview."
);
}

sessionStorage.removeItem(
"current_interview"
);

window.location.href=
link.href;

}catch(error){

console.error(
"Cancel interview error:",
error
);

cancelling=false;

showToast(
error.message||
"Unable to cancel the interview."
);
}
}
);

}
);

});

renderQuestion();

});