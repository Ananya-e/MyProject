document.addEventListener("DOMContentLoaded",()=>{
const userId=localStorage.getItem("user_id");
const API_BASE="http://127.0.0.1:5000";
const detailsModalTitle=document.getElementById("detailsModalTitle");
const detailsContent=document.getElementById("detailsContent");

if(!userId){
window.location.href="login.html";
return;
}

const profileName=document.getElementById("profileName");
const profileAvatar=document.getElementById("profileAvatar");

const sortInterviews=document.getElementById("sortInterviews");
const interviewList=document.getElementById("interviewList");
const emptyState=document.getElementById("emptyState");
const allCount=document.getElementById("allCount");
const completedCount=document.getElementById("completedCount");
const notCompletedCount=document.getElementById("notCompletedCount");
const detailsOverlay=document.getElementById("detailsOverlay");
const detailsClose=document.getElementById("detailsClose");

let interviews=[];
let activeFilter="all";

const user=JSON.parse(localStorage.getItem("user")||"null");

const userName=
user?.full_name||
user?.name||
localStorage.getItem("user_name")||
"User";

if(profileName){
profileName.textContent=userName;
}

if(profileAvatar){
profileAvatar.textContent=userName.charAt(0).toUpperCase();
}

function getInterviewType(interview){
return(
interview.interview_type||
"full"
).toLowerCase();
}

function getTypeLabel(type){
return type
.replace(/_/g," ")
.replace(/\b\w/g,char=>char.toUpperCase());
}

function getTypeIcon(type){
if(type==="technical"){
return"fa-code";
}

if(type==="behavioral"){
return"fa-user";
}

if(type==="voice"){
return"fa-chart-column";
}

return"fa-briefcase";
}

function getTypeClass(type){
if(type==="technical"){
return"technical";
}

if(type==="behavioral"){
return"behavioral";
}

if(type==="voice"){
return"voice";
}

return"full";
}

function getStatus(interview){
const status=
String(interview.status||"completed").toLowerCase();

if(status==="completed"){
return{
label:"Completed",
className:"completed",
filter:"completed"
};
}


return{
label:"Not Completed",
className:"not-completed",
filter:"not_completed"
};
}

function getScore(interview){
const value=Number(interview.overall_score);

if(!Number.isFinite(value)){
return null;
}

return Math.max(0,Math.min(100,Math.round(value)));
}

function formatDate(dateValue){
if(!dateValue){
return{
date:"—",
time:""
};
}

const date=new Date(dateValue);

if(Number.isNaN(date.getTime())){
return{
date:"—",
time:""
};
}

return{
date:date.toLocaleDateString([],{
month:"short",
day:"numeric",
year:"numeric"
}),
time:date.toLocaleTimeString([],{
hour:"2-digit",
minute:"2-digit"
})
};
}

function formatDuration(value){
const minutes=Number(value);

if(!Number.isFinite(minutes)||minutes<=0){
return"—";
}

return`${Math.round(minutes)} min`;
}


function updateCounts(){
const completed=interviews.filter(
interview=>getStatus(interview).filter==="completed"
).length;

const notCompleted=interviews.filter(
interview=>getStatus(interview).filter==="not_completed"
).length;

allCount.textContent=`(${interviews.length})`;
completedCount.textContent=`(${completed})`;
notCompletedCount.textContent=`(${notCompleted})`;
}

function sortList(list){
const sorted=[...list];

if(sortInterviews.value==="oldest"){
return sorted.sort((a,b)=>{
return new Date(a.completed_at||a.started_at||0)-
new Date(b.completed_at||b.started_at||0);
});
}

if(sortInterviews.value==="highest"){
return sorted.sort((a,b)=>{
return(getScore(b)??-1)-(getScore(a)??-1);
});
}

if(sortInterviews.value==="lowest"){
return sorted.sort((a,b)=>{
return(getScore(a)??101)-(getScore(b)??101);
});
}

return sorted.sort((a,b)=>{
return new Date(b.completed_at||b.started_at||0)-
new Date(a.completed_at||a.started_at||0);
});
}


function getVisibleInterviews(){
let list=interviews;

if(activeFilter!=="all"){
list=list.filter(interview=>{
return getStatus(interview).filter===activeFilter;
});
}

return sortList(list);
}

function renderInterview(interview){
const type=getInterviewType(interview);
const typeLabel=getTypeLabel(type);
const typeClass=getTypeClass(type);
const icon=getTypeIcon(type);
const status=getStatus(interview);
const score=getScore(interview);
const date=formatDate(
interview.completed_at||
interview.started_at
);

const role=
interview.target_role||
interview.role||
"Interview";

const scoreValue=
score===null
?"-"
:`${score}%`;

const scoreStyle=
score===null
?"--score:0%"
:`--score:${score}%`;

const questions=
Number(interview.questions_asked);

const row=document.createElement("div");

row.className="interview-row";

row.innerHTML=`
<div class="interview-main">
<div class="interview-icon ${typeClass}">
<i class="fa-solid ${icon}"></i>
</div>
<div class="interview-title">
<strong>${escapeHtml(typeLabel)} Interview</strong>
<span>${escapeHtml(role)}</span>
</div>
</div>
<div class="interview-date">
<i class="fa-regular fa-calendar"></i>
<span>
<span>${escapeHtml(date.date)}</span>
<span>${escapeHtml(date.time)}</span>
</span>
</div>
<div class="interview-duration">
<i class="fa-regular fa-clock"></i>
<span>${escapeHtml(formatDuration(interview.duration_minutes))}</span>
</div>
<div class="score-ring ${score===null?"empty":""}" style="${scoreStyle}">
<span>${scoreValue}</span>
</div>
<div class="score-value">
<span>Score</span>
<strong>${scoreValue}</strong>
</div>
<div class="status-badge ${status.className}">
${status.label}
</div>
<button class="view-btn" type="button">View Details</button>
`;
const viewButton=row.querySelector(".view-btn");

viewButton.addEventListener("click",()=>{
openDetails(interview);
});


return row;
}

function render(){
const visible=getVisibleInterviews();

interviewList.innerHTML="";

if(!visible.length){
emptyState.classList.add("show");
return;
}

emptyState.classList.remove("show");

visible.forEach(interview=>{
interviewList.appendChild(
renderInterview(interview)
);
});
}

async function openDetails(interview) {
    if (!interview || !interview.id) {
        return;
    }

    try {
        const response = await fetch(
            `${API_BASE}/api/interviews/${interview.id}?user_id=${encodeURIComponent(userId)}`
        );

        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.error || "Unable to load interview details.");
        }

        const details = data.interview;
        const questions = data.questions || [];
        const competencyScores = data.competency_scores || {};

        const isCancelled = details.status === "cancelled";
        const isVoice = details.interview_mode === "voice";

        if (isCancelled) {
            detailsModalTitle.textContent = "Interview Not Completed";

            detailsContent.innerHTML = `
                <div class="not-completed-details">
                    <div class="not-completed-icon">
                        <i class="fa-solid fa-circle-xmark"></i>
                    </div>
                    <h3>Interview Not Completed</h3>
                    <p>This interview was cancelled before it was completed.</p>
                </div>
            `;

            detailsOverlay.classList.add("active");
            document.body.style.overflow="hidden";
            return;
        }

        detailsModalTitle.textContent = "Interview Result";

        const summary = details.summary || "No performance summary is available.";

        const competencyItems = [
            ["Communication", competencyScores.communication],
            ["Confidence", competencyScores.confidence],
            ["Technical Skills", competencyScores.technical_skills],
            ["Answer Structure", competencyScores.answer_structure]
        ];

        const competencyHTML = competencyItems.map(([label, value]) => `
            <div class="result-competency">
                <div class="result-competency-header">
                    <span>${label}</span>
                    <strong>${Math.round(Number(value) || 0)}%</strong>
                </div>
                <div class="result-progress">
                    <div style="width:${Math.max(0, Math.min(100, Number(value) || 0))}%"></div>
                </div>
            </div>
        `).join("");

        const questionsHTML = !isVoice && questions.length
            ? `
                <div class="result-section">
                    <h3>Question-wise Performance</h3>
                    <div class="result-questions">
                        ${questions.map((question, index) => `
                            <div class="result-question">
                                <div class="result-question-top">
                                    <span>Question ${index + 1}</span>
                                    <strong>${Number(question.score) || 0}/10</strong>
                                </div>
                                <p class="result-question-text">${question.question || ""}</p>
                                <p class="result-question-feedback">${question.feedback || "No feedback available."}</p>
                            </div>
                        `).join("")}
                    </div>
                </div>
            `
            : "";

        const feedbackHTML = isVoice && details.feedback
            ? `
                <div class="result-section">
                    <h3>AI Feedback</h3>
                    <p class="result-summary-text">${details.feedback}</p>
                </div>
            `
            : "";

        detailsContent.innerHTML = `
            <div class="result-section">
                <h3>Performance Summary</h3>
                <p class="result-summary-text">${summary}</p>
            </div>

            <div class="result-section">
                <h3>Competency Scores</h3>
                <div class="result-competencies">
                    ${competencyHTML}
                </div>
            </div>

            ${feedbackHTML}
            ${questionsHTML}
        `;

        detailsOverlay.classList.add("active");
        document.body.style.overflow = "hidden";

    } catch (error) {
        console.error("Interview details error:", error);
        showToast(error.message || "Unable to load interview details.");
    }
}

function closeDetails(){
detailsOverlay.classList.remove("active");
document.body.style.overflow="";
}

function escapeHtml(value){
return String(value)
.replace(/&/g,"&amp;")
.replace(/</g,"&lt;")
.replace(/>/g,"&gt;")
.replace(/"/g,"&quot;")
.replace(/'/g,"&#039;");
}

async function loadInterviews(){
try{
const response=await fetch("http://127.0.0.1:5000/api/interviews",{
method:"POST",
headers:{
"Content-Type":"application/json"
},
body:JSON.stringify({
user_id:userId
})
});

const data=await response.json();

if(!response.ok){
throw new Error(
data.error||
"Unable to load interview history."
);
}

interviews=Array.isArray(data.interviews)
?data.interviews
:[];

interviews.sort((a,b)=>{
return new Date(b.completed_at||b.started_at||b.created_at||0)-
new Date(a.completed_at||a.started_at||a.created_at||0);
});

updateCounts();
render();

}catch(error){
console.error("Interview history error:",error);

interviews=[];

updateCounts();
render();

if(typeof showToast==="function"){
showToast(
"Unable to load your interview history.",
"error"
);
}
}
}

document.querySelectorAll(".history-tab").forEach(tab=>{
tab.addEventListener("click",()=>{
document.querySelectorAll(".history-tab").forEach(item=>{
item.classList.remove("active");
});

tab.classList.add("active");
activeFilter=tab.dataset.filter||"all";
render();
});
});


sortInterviews.addEventListener("change",render);

detailsClose.addEventListener("click",closeDetails);

detailsOverlay.addEventListener("click",event=>{
if(event.target===detailsOverlay){
closeDetails();
}
});


document.addEventListener("keydown",event=>{
if(event.key==="Escape"){
closeDetails();
}
});

loadInterviews();
});