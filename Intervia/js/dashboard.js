const userId=localStorage.getItem("user_id");

const Dashboard={
async init(){
if(!userId){
window.location.href="login.html";
return;
}
try{
const data=await this.loadDashboard();
this.render(data);
this.setupEvents();
}catch(error){
console.error("Dashboard error:",error);
}
},

async loadDashboard(){
const response=await fetch("http://127.0.0.1:5000/api/dashboard",{
method:"POST",
headers:{
"Content-Type":"application/json"
},
body:JSON.stringify({
user_id:userId
})
});

const result=await response.json();

if(!response.ok||result.error){
throw new Error(result.error||"Failed to load dashboard.");
}

return{
user:result.user,
resume:result.resume,
interviews:result.interviews||[]
};
},

render(data){
const user=data.user;

if(!user){
localStorage.removeItem("user_id");
window.location.href="login.html";
return;
}

const interviews=data.interviews||[];
this.currentInterviews=interviews;

this.text("profileName",user.full_name||"Candidate");
this.text("welcomeName",user.full_name||"Candidate");

if(user.profile_image){
this.attr("profileImage","src",user.profile_image);
}

this.renderResume(data.resume);

this.renderReadiness(interviews);
this.renderRecent(interviews[0]);
this.renderProgress(interviews);
this.renderFocus(interviews);
},

renderResume(resume){
if(!resume){
this.text("resumeName","No resume uploaded");
this.text("resumeDate","Upload your resume to get started");
this.text("resumeStatus","!");
return;
}

this.text("resumeName",resume.file_name||"Resume");
this.text("resumeDate",`Uploaded on ${this.date(resume.uploaded_at)}`);
this.text("resumeStatus","✓");
},

renderReadiness(interviews){
if(!interviews.length){
this.setSkill("communication",0);
this.setSkill("confidence",0);
this.setSkill("technical",0);
this.setSkill("structure",0);
this.text("overallReadiness","0%");
return;
}

const latest=interviews[0];
const overall=Math.round(Number(latest.overall_score)||0);

this.setSkill("communication",overall);
this.setSkill("confidence",overall);
this.setSkill("technical",overall);
this.setSkill("structure",overall);
this.text("overallReadiness",`${overall}%`);
},

setSkill(name,value){
this.text(`${name}Score`,`${Math.round(value)}%`);

const bar=document.getElementById(`${name}Bar`);

if(bar){
bar.style.width=`${Math.min(100,Math.max(0,value))}%`;
}
},

renderRecent(interview){
if(!interview){
this.text("recentInterviewDate","No interviews");
this.text("recentScore","0%");
this.text("recentType","—");
this.text("recentDuration","—");
this.text("recentQuestions","—");
this.text("recentRating","—");
return;
}

this.text(
"recentInterviewDate",
this.relativeDate(interview.completed_at||interview.created_at)
);

this.text(
"recentScore",
`${Math.round(Number(interview.overall_score)||0)}%`
);

this.text(
"recentType",
this.formatInterviewType(interview.interview_type)
);

this.text(
"recentDuration",
interview.duration_minutes
?`${interview.duration_minutes} mins`
:"—"
);

this.text(
"recentQuestions",
interview.questions_asked??"—"
);

const rating=Math.max(
0,
Math.min(5,Number(interview.rating)||0)
);

this.text(
"recentRating",
"★".repeat(rating)+"☆".repeat(5-rating)
);
},

renderProgress(interviews){
const chart=document.getElementById("progressChart");

if(!chart){
return;
}

chart.innerHTML="";

const rangeElement=document.getElementById("progressRange");
const requestedCount=rangeElement
?Number(rangeElement.value)||6
:6;

const list=[...interviews]
.slice(0,requestedCount)
.reverse();

if(!list.length){
const message=document.createElement("div");
message.className="empty-chart-message";
message.textContent="Complete an interview to start tracking your progress.";
chart.appendChild(message);
return;
}

list.forEach((interview,index)=>{
const point=document.createElement("div");

point.className="chart-point";

const score=Math.min(
100,
Math.max(
0,
Number(interview.overall_score)||0
)
);

point.style.left=
list.length===1
?"50%"
:`${(index/(list.length-1))*100}%`;

point.style.bottom=`${score}%`;

point.innerHTML=`
<strong>${Math.round(score)}%</strong>
<span></span>
<small>
Interview ${index+1}<br>
${this.date(interview.completed_at||interview.created_at)}
</small>
`;

point.dataset.interviewId=interview.id;

chart.appendChild(point);
});
},

renderFocus(interviews){
const container=document.getElementById("focusAreas");

if(!container){
return;
}

container.innerHTML="";

if(!interviews.length){
container.innerHTML=`
<div class="focus-item">
<div class="focus-icon purple-bg">!</div>
<div class="focus-text">
<strong>Start your first interview</strong>
<p>Complete an interview to discover your improvement areas.</p>
</div>
<button type="button" data-action="start">Start</button>
</div>
`;
return;
}

const latestScore=Math.round(
Number(interviews[0].overall_score)||0
);

let message="Keep practicing to improve your interview performance.";

if(latestScore<50){
message="Focus on building stronger and more complete answers.";
}else if(latestScore<70){
message="Work on clarity, technical depth and answer structure.";
}else if(latestScore<85){
message="Good progress. Practice consistently to improve further.";
}else{
message="Excellent performance. Keep practicing to maintain your level.";
}

const item=document.createElement("div");

item.className="focus-item";

item.innerHTML=`
<div class="focus-icon purple-bg">!</div>
<div class="focus-text">
<strong>Overall Interview Performance</strong>
<p>${this.escape(message)}</p>
</div>
<button type="button" data-action="practice">Improve</button>
`;

container.appendChild(item);
},

setupEvents(){
document.getElementById("startInterviewBtn")?.addEventListener(
"click",
event=>{
event.preventDefault();
window.location.href="practice.html";
}
);

document.getElementById("resumeBtn")?.addEventListener(
"click",
()=>{
window.location.href="resume.html";
}
);

document.getElementById("analysisBtn")?.addEventListener(
"click",
event=>{
event.preventDefault();

const interviews=this.currentInterviews||[];

if(!interviews.length){
return;
}

const latest=interviews[0];

if(latest.id){
window.location.href=`result.html?interview_id=${latest.id}`;
}
}
);

document.getElementById("quickStart")?.addEventListener(
"click",
event=>{
event.preventDefault();
window.location.href="practice.html";
}
);

document.getElementById("quickResume")?.addEventListener(
"click",
event=>{
event.preventDefault();
window.location.href="resume.html";
}
);

document.getElementById("quickProgress")?.addEventListener(
"click",
event=>{
event.preventDefault();
window.location.href="progress.html";
}
);

document.getElementById("quickPrevious")?.addEventListener(
"click",
event=>{
event.preventDefault();
window.location.href="interviews.html";
}
);

document.getElementById("progressRange")?.addEventListener(
"change",
()=>{
this.renderProgress(this.currentInterviews||[]);
}
);

document.getElementById("focusAreas")?.addEventListener(
"click",
event=>{
const button=event.target.closest("button");

if(!button){
return;
}

const action=button.dataset.action;

if(action==="start"||action==="practice"){
window.location.href="practice.html";
}
}
);

this.currentInterviews=this.currentInterviews||[];
},

text(id,value){
const element=document.getElementById(id);

if(element){
element.textContent=value;
}
},

attr(id,name,value){
const element=document.getElementById(id);

if(element){
element.setAttribute(name,value);
}
},

date(value){
if(!value){
return"";
}

const date=new Date(value);

if(Number.isNaN(date.getTime())){
return"";
}

return date.toLocaleDateString("en-IN",{
day:"2-digit",
month:"short",
year:"numeric"
});
},

relativeDate(value){
if(!value){
return"No interviews";
}

const date=new Date(value);

if(Number.isNaN(date.getTime())){
return"No interviews";
}

const days=Math.floor(
(Date.now()-date.getTime())/86400000
);

if(days<=0){
return"Today";
}

if(days===1){
return"Yesterday";
}

return`${days} days ago`;
},

formatInterviewType(value){
if(!value){
return"—";
}

return value
.replace(/_/g," ")
.replace(/\b\w/g,char=>char.toUpperCase());
},

escape(value){
const div=document.createElement("div");
div.textContent=value??"";
return div.innerHTML;
}
};

document.addEventListener("DOMContentLoaded",async()=>{
await Dashboard.init();
});