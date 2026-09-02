document.addEventListener("DOMContentLoaded",()=>{
const data=JSON.parse(sessionStorage.getItem("current_interview")||"null");
if(!data||!Array.isArray(data.questions)||!data.questions.length){
window.location.href="practice.html";
return;
}

const questions=data.questions;
let currentIndex=0;
const answers=questions.map(q=>q.answer||"");

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

const user=JSON.parse(localStorage.getItem("user")||"null");
const userName=localStorage.getItem("user_name")||user?.full_name||user?.name||"User";

profileName.textContent=userName;
profileAvatar.textContent=userName.charAt(0).toUpperCase();

const type=data.interview?.interview_type||data.interview_type||"FULL MOCK INTERVIEW";
interviewType.textContent=type.replace(/_/g," ").toUpperCase();

targetRoleDisplay.textContent=data.target_role||"Not specified";
experienceDisplay.textContent=data.experience_level||"Not specified";

const toast=document.createElement("div");
toast.className="toast";
document.body.appendChild(toast);

let toastTimer;

function showToast(message){
clearTimeout(toastTimer);
toast.textContent=message;
toast.classList.add("show");
toastTimer=setTimeout(()=>{
toast.classList.remove("show");
},3000);
}

function getQuestionText(question){
if(typeof question==="string")return question;
return question.question||question.text||"Question unavailable.";
}

function saveCurrentAnswer(){
answers[currentIndex]=answerInput.value.trim();
questions[currentIndex].answer=answers[currentIndex];
data.questions=questions;
sessionStorage.setItem("current_interview",JSON.stringify(data));
}

function updateAnsweredCount(){
const count=answers.filter(answer=>answer.trim()!=="").length;
answeredCount.textContent=`${count} answered`;
}

function renderDots(){
questionDots.innerHTML="";

questions.forEach((question,index)=>{
const dot=document.createElement("button");

dot.type="button";
dot.className="question-dot";

if(index===currentIndex)dot.classList.add("current");
if(answers[index].trim()!=="")dot.classList.add("answered");

dot.textContent=index+1;
dot.title=`Question ${index+1}`;

dot.addEventListener("click",()=>{
if(index>currentIndex&&!answers[currentIndex].trim()){
showToast("Please answer the current question before moving ahead.");
answerInput.focus();
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
const question=questions[currentIndex];

currentQuestion.textContent=currentIndex+1;
questionNumber.textContent=`Question ${currentIndex+1}`;
questionText.textContent=getQuestionText(question);
answerInput.value=answers[currentIndex]||"";

previousBtn.disabled=currentIndex===0;

if(currentIndex===questions.length-1){
nextBtn.innerHTML='<span>Submit Interview</span><i class="fa-solid fa-check"></i>';
}else{
nextBtn.innerHTML='<span>Next Question</span><i class="fa-solid fa-arrow-right"></i>';
}

const progress=((currentIndex+1)/questions.length)*100;
progressFill.style.width=`${progress}%`;

updateAnsweredCount();
renderDots();
}

function createConfirmBox(message,onConfirm){
const overlay=document.createElement("div");
overlay.className="interview-confirm-overlay";

const box=document.createElement("div");
box.className="interview-confirm-box";

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

box.querySelector(".confirm-cancel").addEventListener("click",()=>{
overlay.remove();
});

box.querySelector(".confirm-leave").addEventListener("click",()=>{
overlay.remove();
onConfirm();
});

overlay.addEventListener("click",event=>{
if(event.target===overlay)overlay.remove();
});
}

function cancelInterview(){
createConfirmBox(
"Your current answers will be lost if you leave this interview.",
()=>{
sessionStorage.removeItem("current_interview");
window.location.href="practice.html";
}
);
}

answerInput.addEventListener("input",()=>{
answers[currentIndex]=answerInput.value.trim();
questions[currentIndex].answer=answers[currentIndex];
updateAnsweredCount();
renderDots();
});

previousBtn.addEventListener("click",()=>{
saveCurrentAnswer();

if(currentIndex>0){
currentIndex--;
renderQuestion();
}
});

nextBtn.addEventListener("click",async()=>{
const answer=answerInput.value.trim();

if(!answer){
showToast("Please answer this question before continuing.");
answerInput.focus();
return;
}

saveCurrentAnswer();

if(currentIndex<questions.length-1){
currentIndex++;
renderQuestion();
return;
}

const unanswered=answers.filter(answer=>!answer.trim()).length;

if(unanswered>0){
showToast(`Please answer all ${unanswered} remaining question${unanswered===1?"":"s"} before submitting.`);
return;
}

const userId=localStorage.getItem("user_id");
const interviewId=data.interview?.id;

if(!userId||!interviewId){
showToast("Interview information is missing. Please start a new interview.");
return;
}

nextBtn.disabled=true;
previousBtn.disabled=true;
nextBtn.innerHTML='<i class="fa-solid fa-spinner fa-spin"></i><span>Evaluating...</span>';

try{
const response=await fetch("http://127.0.0.1:5000/api/interview/submit",{
method:"POST",
headers:{
"Content-Type":"application/json"
},
body:JSON.stringify({
user_id:userId,
interview_id:interviewId,
answers:answers.map((answer,index)=>({
question_number:index+1,
answer:answer
}))
})
});

const result=await response.json();

if(!response.ok){
throw new Error(result.error||"Unable to evaluate the interview.");
}

const completeResult={
...result,
interview:data.interview,
questions:data.questions,
target_role:data.target_role,
experience_level:data.experience_level,
interview_type:data.interview_type||data.interview?.interview_type
};

sessionStorage.setItem("interview_result",JSON.stringify(completeResult));
sessionStorage.removeItem("current_interview");

window.location.href="result.html";

}catch(error){
console.error("Interview evaluation error:",error);
showToast(error.message||"Unable to evaluate the interview.");

nextBtn.disabled=false;
previousBtn.disabled=currentIndex===0;

nextBtn.innerHTML='<span>Submit Interview</span><i class="fa-solid fa-check"></i>';
}
});

cancelBtn.addEventListener("click",cancelInterview);

const menuLinks=document.querySelectorAll(".side-menu-nav a");

menuLinks.forEach(link=>{
link.addEventListener("click",event=>{
event.preventDefault();

createConfirmBox(
"You are currently in an interview. Leaving now will cancel this interview.",
()=>{
sessionStorage.removeItem("current_interview");
window.location.href=link.href;
}
);
});
});

renderQuestion();
});