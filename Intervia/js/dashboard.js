console.log("[Intervia] dashboard.js loaded — resume-state-rebuild-v1");

const API_BASE=window.API_BASE||"http://127.0.0.1:5000";
const userId=localStorage.getItem("user_id");

const Dashboard={
currentInterviews:[],
currentResume:null,
currentUser:null,

async init(){
if(!userId){
window.location.href="login.html";
return;
}

try{
const data=await this.loadDashboard();

this.currentInterviews=data.interviews||[];
this.currentResume=data.resume||null;
this.currentUser=data.user||null;

this.render(data);
this.setupEvents();
this.showPostUploadAnalysisIfNeeded();

}catch(error){
console.error("Dashboard error:",error);
showToast(error.message||"Unable to load dashboard.","error");
}
},

// Runs once, right after a fresh dashboard load. If the previous
// action was a resume upload (see uploadSelectedResume), the resume
// card above was just rendered by the normal, always-correct load
// path — so we simply surface the success toast and open the
// analysis modal here, using data we already trust.
showPostUploadAnalysisIfNeeded(){
if(sessionStorage.getItem("intervia_resume_just_uploaded")!=="1"){
return;
}

sessionStorage.removeItem("intervia_resume_just_uploaded");

showToast("Resume analyzed successfully.","success");

if(this.currentResume){
this.openAnalysisModal();
}
},

async loadDashboard(){
const response=await fetch(`${API_BASE}/api/dashboard`,{
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

return result;
},

render(data){
const user=data.user;

if(!user){
localStorage.removeItem("user_id");
window.location.href="login.html";
return;
}

this.currentUser=user;

this.text("profileName",user.full_name||"Candidate");
this.text("welcomeName",user.full_name||"Candidate");

if(user.profile_image){
this.attr("profileImage","src",user.profile_image);
}

this.renderResume(data.resume);
this.renderReadiness(data.interviews||[]);
this.renderRecent((data.interviews||[])[0]);
this.renderFocus(data.interviews||[]);
},

renderResume(resume){
this.currentResume=resume||null;

const emptyState=document.getElementById("resumeEmptyState");
const loadedState=document.getElementById("resumeLoadedState");

if(!resume){
if(emptyState)emptyState.hidden=false;
if(loadedState)loadedState.hidden=true;
return;
}

if(emptyState)emptyState.hidden=true;
if(loadedState)loadedState.hidden=false;

this.text(
"resumeName",
resume.file_name||"Resume"
);

this.text(
"resumeDate",
resume.uploaded_at
?`Uploaded on ${this.date(resume.uploaded_at)}`
:"Uploaded recently"
);

this.text(
"resumeStatus",
"Analyzed"
);
},

renderReadiness(interviews){
if(!interviews.length){
this.setSkill("communication",0);
this.setSkill("confidence",0);
this.setSkill("technical",0);
this.setSkill("structure",0);
this.text("overallReadiness","0%");
this.setReadinessCircle(0);
return;
}

const latest=interviews[0];
const scores=latest.competency_scores||{};

const communication=Number(scores.communication)||0;
const confidence=Number(scores.confidence)||0;
const technical=Number(scores.technical_skills)||0;
const structure=Number(scores.answer_structure)||0;

let overall=Number(latest.overall_score)||0;

if(!overall){
overall=Math.round(
(communication+confidence+technical+structure)/4
);
}

this.setSkill("communication",communication);
this.setSkill("confidence",confidence);
this.setSkill("technical",technical);
this.setSkill("structure",structure);

this.text(
"overallReadiness",
`${Math.round(overall)}%`
);

this.setReadinessCircle(overall);
},

setReadinessCircle(value){
const circle=document.querySelector(".readiness-circle");

if(!circle){
return;
}

const score=Math.min(
100,
Math.max(0,Number(value)||0)
);

circle.style.background=
`conic-gradient(#6842e8 0 ${score}%,#e7ebf5 ${score}% 100%)`;
},

setSkill(name,value){
const score=Math.min(
100,
Math.max(0,Number(value)||0)
);

this.text(
`${name}Score`,
`${Math.round(score)}%`
);

const bar=document.getElementById(`${name}Bar`);

if(bar){
bar.style.width=`${score}%`;
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

const analysisBtn=document.getElementById("analysisBtn");

if(analysisBtn){
analysisBtn.style.pointerEvents="none";
analysisBtn.style.opacity=".5";
}

return;
}

this.text(
"recentInterviewDate",
this.interviewDate(interview.completed_at)
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

const rating=Math.min(
5,
Math.max(0,Number(interview.rating)||0)
);

this.text(
"recentRating",
"★".repeat(rating)+"☆".repeat(5-rating)
);

const analysisBtn=document.getElementById("analysisBtn");

if(analysisBtn){
analysisBtn.style.pointerEvents="auto";
analysisBtn.style.opacity="1";
}
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
<p>Complete an interview to discover your strengths and improvement areas.</p>
</div>
<button type="button" data-action="start">Start</button>
</div>
`;

return;
}

const latest=interviews[0];
const score=latest.competency_scores||{};

const areas=[
{
name:"Communication",
value:Number(score.communication)||0,
icon:"fa-comments",
className:"purple-bg",
description(value){
if(value<60){
return"Focus on expressing your ideas clearly and keeping your responses easy to follow.";
}

if(value<75){
return"Work on making your explanations clearer and more concise.";
}

if(value<85){
return"Improve clarity and consistency when explaining your ideas.";
}

return"Your communication is strong. Keep your responses clear and focused.";
}
},
{
name:"Confidence",
value:Number(score.confidence)||0,
icon:"fa-user",
className:"blue-bg",
description(value){
if(value<60){
return"Practice answering without hesitation and use a steady delivery.";
}

if(value<75){
return"Work on reducing hesitation and delivering your answers with more confidence.";
}

if(value<85){
return"Maintain a confident tone and avoid unnecessary filler words.";
}

return"Your confidence is strong. Continue practicing natural delivery.";
}
},
{
name:"Technical Skills",
value:Number(score.technical_skills)||0,
icon:"fa-code",
className:"green-bg",
description(value){
if(value<60){
return"Strengthen your technical fundamentals and use practical examples.";
}

if(value<75){
return"Add more technical depth and explain your implementation choices.";
}

if(value<85){
return"Connect technical concepts to real-world implementation examples.";
}

return"Your technical knowledge is strong. Keep practicing deeper explanations.";
}
},
{
name:"Answer Structure",
value:Number(score.answer_structure)||0,
icon:"fa-file-lines",
className:"orange-bg",
description(value){
if(value<60){
return"Structure responses with a clear beginning, explanation, example and conclusion.";
}

if(value<75){
return"Organize your answers more logically and use the STAR method.";
}

if(value<85){
return"Improve the flow by clearly separating situation, action and result.";
}

return"Your answers are well structured. Keep using a logical response flow.";
}
}
];

areas.sort((a,b)=>a.value-b.value);

const weakest=areas
.filter(area=>area.value<85)
.slice(0,2);

const selectedAreas=weakest.length
?weakest
:areas.slice(0,2);

selectedAreas.forEach(area=>{
const item=document.createElement("div");

item.className="focus-item";

item.innerHTML=`
<div class="focus-icon ${this.escape(area.className)}">
<i class="fa-solid ${this.escape(area.icon)}"></i>
</div>

<div class="focus-text">
<strong>${this.escape(area.name)}</strong>
<p>${this.escape(area.description(area.value))}</p>
</div>

<button type="button" data-action="practice">
Practice
</button>
`;

container.appendChild(item);
});
},

setupEvents(){
document.getElementById("startInterviewBtn")?.addEventListener(
"click",
event=>{
event.preventDefault();
window.location.href="practice.html";
}
);

document.getElementById("uploadResumeBtn")?.addEventListener(
"click",
()=>{
this.openUploadModal(false);
}
);

document.getElementById("uploadNewBtn")?.addEventListener(
"click",
()=>{
this.openUploadModal(true);
}
);

document.getElementById("resumeBtn")?.addEventListener(
"click",
()=>{
this.openResumePreview();
}
);

document.getElementById("viewAnalysisBtn")?.addEventListener(
"click",
()=>{
this.openAnalysisModal();
}
);

document.getElementById("removeResumeBtn")?.addEventListener(
"click",
()=>{
this.openRemoveModal();
}
);

document.getElementById("closeUploadModal")?.addEventListener(
"click",
()=>{
this.closeUploadModal();
}
);

document.getElementById("cancelUpload")?.addEventListener(
"click",
()=>{
this.closeUploadModal();
}
);

document.getElementById("startResumeAnalysis")?.addEventListener(
"click",
()=>{
this.uploadSelectedResume();
}
);

document.getElementById("closeAnalysisModal")?.addEventListener(
"click",
()=>{
this.closeAnalysisModal();
}
);

document.getElementById("closeAnalysisBottom")?.addEventListener(
"click",
()=>{
this.closeAnalysisModal();
}
);

document.getElementById("closePreviewModal")?.addEventListener(
"click",
()=>{
this.closePreviewModal();
}
);

document.getElementById("closePreviewBottom")?.addEventListener(
"click",
()=>{
this.closePreviewModal();
}
);

document.getElementById("closeRemoveModal")?.addEventListener(
"click",
()=>{
this.closeRemoveModal();
}
);

document.getElementById("cancelRemove")?.addEventListener(
"click",
()=>{
this.closeRemoveModal();
}
);

document.getElementById("confirmRemove")?.addEventListener(
"click",
()=>{
this.removeResume();
}
);

document.getElementById("resumeFileInput")?.addEventListener(
"change",
event=>{
const file=event.target.files?.[0];

if(!file){
return;
}

if(!this.isSupportedFile(file)){
showToast(
"Please upload a PDF or DOCX file.",
"error"
);

event.target.value="";
return;
}

this.text(
"selectedFileName",
file.name
);

const button=document.getElementById("startResumeAnalysis");

if(button){
button.disabled=false;
}
}
);

document.querySelectorAll(".resume-modal-backdrop").forEach(
modal=>{
modal.addEventListener("click",event=>{
if(event.target===modal){
this.closeModalByElement(modal);
}
});
}
);

document.getElementById("focusAreas")?.addEventListener(
"click",
event=>{
const button=event.target.closest("button");

if(!button){
return;
}

if(
button.dataset.action==="start"||
button.dataset.action==="practice"
){
window.location.href="practice.html";
}
}
);

document.addEventListener("keydown",event=>{
if(event.key!=="Escape"){
return;
}

const openModal=document.querySelector(
".resume-modal-backdrop:not([hidden])"
);

if(openModal){
this.closeModalByElement(openModal);
}
});
},

openUploadModal(replace){
const modal=document.getElementById("resumeUploadModal");

const title=document.getElementById("uploadModalTitle");
const text=document.getElementById("uploadModalText");

const input=document.getElementById("resumeFileInput");
const selected=document.getElementById("selectedFileName");

const progress=document.getElementById("uploadProgressState");
const actions=document.getElementById("uploadModalActions");
const button=document.getElementById("startResumeAnalysis");

if(title){
title.textContent=replace
?"Replace your resume"
:"Upload your resume";
}

if(text){
text.textContent=replace
?"Upload a newer resume. Your new analysis will become your active interview profile."
:"Upload your latest resume and let Intervia analyze your professional background.";
}

if(input){
input.value="";
}

if(selected){
selected.textContent="";
}

if(progress){
progress.hidden=true;
}

if(actions){
actions.hidden=false;
}

if(button){
button.disabled=true;
}

if(modal){
modal.hidden=false;
}

document.body.style.overflow="hidden";
},

closeUploadModal(){
const modal=document.getElementById("resumeUploadModal");

if(modal){
modal.hidden=true;
}

document.body.style.overflow="";
},

async uploadSelectedResume(){
const input=document.getElementById("resumeFileInput");
const file=input?.files?.[0];

if(!file){
showToast("Please choose a resume first.","error");
return;
}

if(!this.isSupportedFile(file)){
showToast("Please upload a PDF or DOCX file.","error");
return;
}

const progress=document.getElementById("uploadProgressState");
const actions=document.getElementById("uploadModalActions");
const dropZone=document.getElementById("resumeDropZone");
const analysisButton=document.getElementById("startResumeAnalysis");

if(progress)progress.hidden=false;
if(actions)actions.hidden=true;
if(dropZone)dropZone.hidden=true;
if(analysisButton)analysisButton.disabled=true;

showToast("Analyzing your resume...","info");

try{
const formData=new FormData();
formData.append("resume",file);
formData.append("user_id",userId);

const response=await fetch(`${API_BASE}/api/resume/parse`,{
method:"POST",
body:formData
});

let data;

try{
data=await response.json();
}catch(error){
throw new Error(`Server returned an invalid response (${response.status}).`);
}

if(!response.ok||!data?.success){
throw new Error(
data?.error||
data?.details||
`Resume analysis failed (${response.status}).`
);
}

if(!data?.resume){
throw new Error("No resume analysis data was returned.");
}

// The resume is now fully analyzed and saved server-side. Instead of
// hand-building the resume card's state on the client (the source of
// the earlier bug), we hand off to a full reload: the normal
// init() → loadDashboard() → render() path is the one path that has
// been reliable in every test, because it reads the server's
// confirmed state fresh, with no client-side guessing involved.
sessionStorage.setItem("intervia_resume_just_uploaded","1");

window.location.reload();

}catch(error){
console.error("Resume analysis error:",error);

showToast(
error?.message||
"Resume analysis failed. Please try again.",
"error"
);

if(progress)progress.hidden=true;
if(actions)actions.hidden=false;
if(dropZone)dropZone.hidden=false;
if(analysisButton)analysisButton.disabled=false;

}finally{
if(input)input.value="";
}
},

openAnalysisModal(){
if(!this.currentResume){
showToast(
"No analyzed resume found.",
"error"
);

return;
}

const parsed=this.currentResume.parsed_data;

if(!parsed){
showToast(
"Resume analysis is not available.",
"error"
);

return;
}

this.renderAnalysis(parsed);

const modal=document.getElementById(
"resumeAnalysisModal"
);

if(modal){
modal.hidden=false;
}

document.body.style.overflow="hidden";
},

closeAnalysisModal(){
const modal=document.getElementById(
"resumeAnalysisModal"
);

if(modal){
modal.hidden=true;
}

document.body.style.overflow="";
},

renderAnalysis(resume){
const candidate=resume.candidate||{};

const name=
candidate.name||
this.currentUser?.full_name||
"Not detected";

const location=
candidate.location||
"Location not detected";

this.text(
"analysisCandidateInitial",
this.getInitial(name)
);

this.text(
"analysisCandidateName",
name
);

this.text(
"analysisCandidateLocation",
location
);

this.text(
"analysisExperienceLevel",
resume.experience_level||
"Not specified"
);

this.text(
"analysisSummary",
resume.professional_summary||
"No professional summary was detected."
);

this.renderSkills(
resume.skills||[]
);

this.renderExperience(
resume.experience||[]
);

this.renderEducation(
resume.education||[]
);

this.renderProjects(
resume.projects||[]
);

this.renderCertifications(
resume.certifications||[]
);

this.renderLanguages(
resume.languages||[]
);
},

renderSkills(skills){
const container=document.getElementById(
"analysisSkills"
);

if(!container){
return;
}

container.innerHTML="";

if(!Array.isArray(skills)||!skills.length){
container.appendChild(
this.emptyElement("No skills detected.")
);

return;
}

skills.forEach(skill=>{
const tag=document.createElement("span");

tag.className="analysis-tag";

tag.textContent=
typeof skill==="string"
?skill
:skill.name||
skill.skill||
skill.title||
"Skill";

container.appendChild(tag);
});
},

renderExperience(items){
const container=document.getElementById(
"analysisExperience"
);

if(!container){
return;
}

container.innerHTML="";

if(!Array.isArray(items)||!items.length){
container.appendChild(
this.emptyElement("No work experience detected.")
);

return;
}

items.forEach(item=>{
const wrapper=document.createElement("div");

wrapper.className="analysis-list-item";

const title=document.createElement("strong");

title.textContent=
item.job_title||
item.role||
item.position||
"Experience";

const meta=document.createElement("span");

const company=item.company||"";
const location=item.location||"";

const dates=[
item.start_date||"",
item.end_date||""
]
.filter(Boolean)
.join(" - ");

meta.textContent=[
company,
location,
dates
]
.filter(Boolean)
.join(" • ");

const description=document.createElement("p");

description.textContent=
item.description||
"No description available.";

wrapper.appendChild(title);

if(meta.textContent){
wrapper.appendChild(meta);
}

if(description.textContent){
wrapper.appendChild(description);
}

container.appendChild(wrapper);
});
},

renderEducation(items){
const container=document.getElementById(
"analysisEducation"
);

if(!container){
return;
}

container.innerHTML="";

if(!Array.isArray(items)||!items.length){
container.appendChild(
this.emptyElement("No education details detected.")
);

return;
}

items.forEach(item=>{
const wrapper=document.createElement("div");

wrapper.className="analysis-list-item";

const title=document.createElement("strong");

title.textContent=
item.degree||
item.qualification||
item.course||
"Education";

const meta=document.createElement("span");

const institution=item.institution||"";

const dates=[
item.start_date||"",
item.end_date||""
]
.filter(Boolean)
.join(" - ");

meta.textContent=[
institution,
dates
]
.filter(Boolean)
.join(" • ");

wrapper.appendChild(title);

if(meta.textContent){
wrapper.appendChild(meta);
}

container.appendChild(wrapper);
});
},

renderProjects(items){
const container=document.getElementById(
"analysisProjects"
);

if(!container){
return;
}

container.innerHTML="";

if(!Array.isArray(items)||!items.length){
container.appendChild(
this.emptyElement("No projects detected.")
);

return;
}

items.forEach(item=>{
const wrapper=document.createElement("div");

wrapper.className="analysis-list-item";

const title=document.createElement("strong");

title.textContent=
typeof item==="string"
?item
:item.name||
"Project";

const meta=document.createElement("span");

if(typeof item==="object"){
const technologies=
Array.isArray(item.technologies)
?item.technologies.join(", ")
:item.technologies||"";

meta.textContent=
item.description||
technologies||
"";
}

wrapper.appendChild(title);

if(meta.textContent){
wrapper.appendChild(meta);
}

container.appendChild(wrapper);
});
},

renderCertifications(items){
const container=document.getElementById(
"analysisCertifications"
);

if(!container){
return;
}

container.innerHTML="";

if(!Array.isArray(items)||!items.length){
container.appendChild(
this.emptyElement("None detected.")
);

return;
}

items.forEach(item=>{
const element=document.createElement("div");

element.className="analysis-mini-item";

element.textContent=
typeof item==="string"
?item
:item.name||
item.title||
item.certification||
"Certification";

container.appendChild(element);
});
},

renderLanguages(items){
const container=document.getElementById(
"analysisLanguages"
);

if(!container){
return;
}

container.innerHTML="";

if(!Array.isArray(items)||!items.length){
container.appendChild(
this.emptyElement("None detected.")
);

return;
}

items.forEach(item=>{
const element=document.createElement("div");

element.className="analysis-mini-item";

element.textContent=
typeof item==="string"
?item
:item.name||
item.language||
"Language";

container.appendChild(element);
});
},

openResumePreview(){
if(!this.currentResume?.id){
showToast(
"Resume file is not available.",
"error"
);

return;
}

const fileName=
this.currentResume.file_name||
"Resume";

const extension=this.getExtension(fileName);

const resumeUrl=
`${API_BASE}/api/resume/view/${this.currentResume.id}?user_id=${encodeURIComponent(userId)}`;

if(extension!==".pdf"){
window.open(
resumeUrl,
"_blank"
);

return;
}

this.text(
"previewResumeName",
fileName
);

const frame=document.getElementById(
"resumePreviewFrame"
);

if(frame){
frame.src=resumeUrl;
}

const modal=document.getElementById(
"resumePreviewModal"
);

if(modal){
modal.hidden=false;
}

document.body.style.overflow="hidden";
},

closePreviewModal(){
const modal=document.getElementById(
"resumePreviewModal"
);

const frame=document.getElementById(
"resumePreviewFrame"
);

if(frame){
frame.src="";
}

if(modal){
modal.hidden=true;
}

document.body.style.overflow="";
},

openRemoveModal(){
if(!this.currentResume?.id){
showToast(
"No saved resume found.",
"error"
);

return;
}

const modal=document.getElementById(
"removeResumeModal"
);

if(modal){
modal.hidden=false;
}

document.body.style.overflow="hidden";
},

closeRemoveModal(){
const modal=document.getElementById(
"removeResumeModal"
);

if(modal){
modal.hidden=true;
}

document.body.style.overflow="";
},

async removeResume(){
if(!this.currentResume?.id){
return;
}

const button=document.getElementById(
"confirmRemove"
);

if(button){
button.disabled=true;
}

try{
const response=await fetch(
`${API_BASE}/api/resume/${this.currentResume.id}`,
{
method:"DELETE",
headers:{
"Content-Type":"application/json"
},
body:JSON.stringify({
user_id:userId
})
}
);

const data=await response.json();

if(!response.ok||!data.success){
throw new Error(
data.error||
"Unable to remove resume."
);
}

this.currentResume=null;

this.closeRemoveModal();

this.renderResume(null);

showToast(
"Resume removed successfully.",
"success"
);

}catch(error){
console.error("Resume removal error:",error);

showToast(
error.message||
"Unable to remove resume.",
"error"
);

}finally{
if(button){
button.disabled=false;
}
}
},

closeModalByElement(modal){
if(!modal){
return;
}

modal.hidden=true;

const frame=document.getElementById(
"resumePreviewFrame"
);

if(modal.id==="resumePreviewModal"&&frame){
frame.src="";
}

document.body.style.overflow="";
},

emptyElement(text){
const element=document.createElement("div");

element.className="analysis-empty";
element.textContent=text;

return element;
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

return date.toLocaleDateString(
"en-IN",
{
day:"2-digit",
month:"short",
year:"numeric"
}
);
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

if(days<7){
return`${days} days ago`;
}

return this.date(value);
},

interviewDate(value){
if(!value){
return"—";
}

const raw=String(value);

const datePart=raw.split("T")[0];

const parts=datePart.split("-");

if(parts.length!==3){
return this.date(value)||"—";
}

const year=Number(parts[0]);
const month=Number(parts[1])-1;
const day=Number(parts[2]);

const date=new Date(
year,
month,
day
);

if(Number.isNaN(date.getTime())){
return"—";
}

return date.toLocaleDateString(
"en-IN",
{
day:"2-digit",
month:"short",
year:"numeric"
}
);
},

formatInterviewType(value){
if(!value){
return"—";
}

return String(value)
.replace(/_/g," ")
.replace(/\b\w/g,char=>char.toUpperCase());
},

isSupportedFile(file){
const name=file.name.toLowerCase();

return name.endsWith(".pdf")||
name.endsWith(".docx");
},

getExtension(fileName){
const index=fileName.lastIndexOf(".");

if(index===-1){
return"";
}

return fileName.slice(index).toLowerCase();
},

getInitial(name){
if(!name){
return"U";
}

const clean=String(name).trim();

return clean
?clean.charAt(0).toUpperCase()
:"U";
},

escape(value){
const div=document.createElement("div");

div.textContent=value??"";

return div.innerHTML;
}
};

document.addEventListener(
"DOMContentLoaded",
()=>{
Dashboard.init();
}
);