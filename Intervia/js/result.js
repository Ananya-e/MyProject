document.addEventListener("DOMContentLoaded",()=>{

const userId=localStorage.getItem("user_id");

if(!userId){
window.location.href="login.html";
return;
}

let result;

try{
result=JSON.parse(
sessionStorage.getItem("interview_result")||"null"
);
}catch(error){
sessionStorage.removeItem("interview_result");
window.location.href="practice.html";
return;
}

if(!result){
window.location.href="practice.html";
return;
}

const resultUserId=
result.user_id||
result.interview?.user_id||
null;

if(
resultUserId&&
String(resultUserId)!==String(userId)
){
sessionStorage.removeItem("interview_result");
window.location.href="practice.html";
return;
}

const user=JSON.parse(
localStorage.getItem("user")||"null"
);

const userName=
user?.full_name||
user?.name||
"User";

const questions=result.questions||[];
const evaluations=result.evaluations||[];

const isVoiceInterview=
result.interview_mode==="voice"||
result.mode==="voice"||
Array.isArray(result.transcript);

const profileName=document.getElementById("profileName");
const profileAvatar=document.getElementById("profileAvatar");
const resultRole=document.getElementById("resultRole");
const resultExperience=document.getElementById("resultExperience");
const resultType=document.getElementById("resultType");
const resultDate=document.getElementById("resultDate");
const overallScore=document.getElementById("overallScore");
const scoreMessage=document.getElementById("scoreMessage");
const scoreBarFill=document.getElementById("scoreBarFill");
const ratingValue=document.getElementById("ratingValue");
const ratingMessage=document.getElementById("ratingMessage");
const ratingStars=document.getElementById("ratingStars");
const answeredQuestions=document.getElementById("answeredQuestions");
const totalQuestions=document.getElementById("totalQuestions");
const answeredMessage=document.getElementById("answeredMessage");
const answeredBarFill=document.getElementById("answeredBarFill");
const timeTaken=document.getElementById("timeTaken");
const timeMessage=document.getElementById("timeMessage");
const circleScore=document.getElementById("circleScore");
const performanceSummary=document.getElementById("performanceSummary");
const strengthsList=document.getElementById("strengthsList");
const improvementsList=document.getElementById("improvementsList");
const questionPerformance=document.querySelector(".question-performance");
const questionTableBody=document.getElementById("questionTableBody");
const feedbackOverlay=document.getElementById("feedbackOverlay");
const feedbackClose=document.getElementById("feedbackClose");
const feedbackQuestion=document.getElementById("feedbackQuestion");
const feedbackScore=document.getElementById("feedbackScore");
const feedbackAnswer=document.getElementById("feedbackAnswer");
const feedbackText=document.getElementById("feedbackText");
const viewAllQuestionsBtn=document.getElementById("viewAllQuestionsBtn");
const downloadReportBtn=document.getElementById("downloadReportBtn");
const practiceAgainBtn=document.getElementById("practiceAgainBtn");
const backDashboardBtn=document.getElementById("backDashboardBtn");
const viewInterviewsBtn=document.getElementById("viewInterviewsBtn");
const voicePerformance=document.getElementById("voicePerformance");
const viewTranscriptBtn=document.getElementById("viewTranscriptBtn");
const transcriptOverlay=document.getElementById("transcriptOverlay");
const transcriptClose=document.getElementById("transcriptClose");
const voiceTranscript=document.getElementById("voiceTranscript");
const communicationScore=document.getElementById("communicationScore");
const confidenceScore=document.getElementById("confidenceScore");
const technicalSkillsScore=document.getElementById("technicalSkillsScore");
const answerStructureScore=document.getElementById("answerStructureScore");
const communicationBar=document.getElementById("communicationBar");
const confidenceBar=document.getElementById("confidenceBar");
const technicalSkillsBar=document.getElementById("technicalSkillsBar");
const answerStructureBar=document.getElementById("answerStructureBar");

if(profileName){
profileName.textContent=userName;
}

if(profileAvatar){
profileAvatar.textContent=
userName.charAt(0).toUpperCase();
}

if(resultRole){
resultRole.textContent=
result.target_role||
result.interview?.target_role||
"Not specified";
}

if(resultExperience){
resultExperience.textContent=
result.experience_level||
result.interview?.experience_level||
"Not specified";
}

const type=
result.interview_type||
result.interview?.interview_type||
"full";

if(resultType){
resultType.textContent=
type
.replace(/_/g," ")
.replace(/\b\w/g,char=>char.toUpperCase());
}

const completedAt=
result.completed_at||
result.interview?.completed_at||
new Date().toISOString();

if(resultDate){
resultDate.textContent=
new Date(completedAt).toLocaleString([],{
day:"2-digit",
month:"short",
year:"numeric",
hour:"2-digit",
minute:"2-digit"
});
}

const score=
Math.max(
0,
Math.min(
100,
Number(result.overall_score)||0
)
);

const rating=
Math.max(
0,
Math.min(
5,
Number(result.rating)||0
)
);

if(overallScore){
overallScore.textContent=score;
}

if(scoreBarFill){
scoreBarFill.style.width=
`${score}%`;
}

if(circleScore){
circleScore.textContent=
`${score}%`;
}

const scoreCircle=
document.querySelector(".score-circle");

if(scoreCircle){
scoreCircle.style.setProperty(
"--score",
`${score}%`
);
}

function getScoreMessage(value){

if(value>=90){
return"Outstanding Performance!";
}

if(value>=80){
return"Great Performance!";
}

if(value>=70){
return"Good Performance!";
}

if(value>=60){
return"Fair Performance";
}

return"Needs Improvement";
}

if(scoreMessage){
scoreMessage.textContent=
getScoreMessage(score);
}

if(ratingValue){
ratingValue.textContent=rating;
}

if(ratingMessage){
ratingMessage.textContent=
rating>=4.5
?"Excellent"
:rating>=4
?"Very Good"
:rating>=3
?"Good"
:rating>=2
?"Needs Improvement"
:"Poor";
}

if(ratingStars){

ratingStars.innerHTML="";

for(let i=1;i<=5;i++){

const star=
document.createElement("i");

star.className=
`fa-solid fa-star${i<=Math.round(rating)?" active":""}`;

ratingStars.appendChild(star);
}
}

const durationMinutes=
Number(result.duration_minutes);

if(timeTaken){

if(
Number.isFinite(durationMinutes)&&
durationMinutes>0
){
timeTaken.textContent=
`${durationMinutes} min`;
}else{
timeTaken.textContent="—";
}
}

if(timeMessage){

timeMessage.textContent=
isVoiceInterview
?"Voice interview duration"
:"Interview duration";
}

if(performanceSummary){
performanceSummary.textContent=
result.summary||
"Your interview evaluation has been completed.";
}

function addListItems(
list,
items,
fallback
){

if(!list){
return;
}

list.innerHTML="";

const cleanItems=
(items||[])
.map(item=>String(item).trim())
.filter(Boolean);

const unique=[
...new Set(cleanItems)
].slice(0,4);

if(!unique.length){

const li=
document.createElement("li");

li.textContent=fallback;

list.appendChild(li);

return;
}

unique.forEach(item=>{

const li=
document.createElement("li");

li.textContent=item;

list.appendChild(li);

});
}

function getVoiceScore(name){

const value=
Number(result[name]);

if(!Number.isFinite(value)){
return 0;
}

return Math.max(
0,
Math.min(
100,
Math.round(value)
)
);
}

function renderVoiceResult(){

if(!voicePerformance){
return;
}

voicePerformance.style.display="block";

if(questionPerformance){
questionPerformance.style.display="none";
}

const questionCard=
document.querySelector(
".score-card:nth-child(3)"
);

const questionLabel=
questionCard?.querySelector(
".score-label"
);

const questionValue=
questionCard?.querySelector(
".score-value strong"
);

const questionSuffix=
questionCard?.querySelector(
".score-value span"
);

const questionMessage=
questionCard?.querySelector(
".score-message"
);

const questionBar=
questionCard?.querySelector(
".score-bar"
);

if(questionLabel){
questionLabel.textContent="INTERVIEW MODE";
}

if(questionValue){
questionValue.textContent="Voice";
}

if(questionSuffix){
questionSuffix.textContent="";
}

if(questionMessage){
questionMessage.textContent=
"Dynamic AI Interview";
}

if(questionBar){
questionBar.style.display="none";
}

const communication=
getVoiceScore("communication");

const confidence=
getVoiceScore("confidence");

const technicalSkills=
getVoiceScore("technical_skills");

const answerStructure=
getVoiceScore("answer_structure");

if(communicationScore){
communicationScore.textContent=
`${communication}%`;
}

if(confidenceScore){
confidenceScore.textContent=
`${confidence}%`;
}

if(technicalSkillsScore){
technicalSkillsScore.textContent=
`${technicalSkills}%`;
}

if(answerStructureScore){
answerStructureScore.textContent=
`${answerStructure}%`;
}

if(communicationBar){
communicationBar.style.width=
`${communication}%`;
}

if(confidenceBar){
confidenceBar.style.width=
`${confidence}%`;
}

if(technicalSkillsBar){
technicalSkillsBar.style.width=
`${technicalSkills}%`;
}

if(answerStructureBar){
answerStructureBar.style.width=
`${answerStructure}%`;
}

const strengths=[];
const improvements=[];

if(communication>=75){
strengths.push(
"Communicated ideas clearly and effectively."
);
}else if(communication>0){
improvements.push(
"Work on communicating ideas more clearly and concisely."
);
}

if(confidence>=75){
strengths.push(
"Demonstrated confidence while responding to the interviewer."
);
}else if(confidence>0){
improvements.push(
"Build confidence and reduce hesitation during responses."
);
}

if(technicalSkills>=75){
strengths.push(
"Demonstrated solid technical understanding relevant to the interview."
);
}else if(technicalSkills>0){
improvements.push(
"Strengthen technical fundamentals and explain concepts with more depth."
);
}

if(answerStructure>=75){
strengths.push(
"Structured responses in a logical and understandable way."
);
}else if(answerStructure>0){
improvements.push(
"Use a clearer structure when explaining answers and examples."
);
}

addListItems(
strengthsList,
strengths,
"Keep building on your strongest interview skills."
);

addListItems(
improvementsList,
improvements,
"Continue practicing to improve consistency."
);

renderVoiceTranscript();
}

function cleanTranscriptText(text){

return String(text||"")
.replace(/\s+/g," ")
.trim();
}

function shouldAddSpace(previous,current){

if(!previous){
return false;
}

if(!current){
return false;
}

if(/^[.,!?;:%)\]}]/.test(current)){
return false;
}

if(/[([{]$/.test(previous)){
return false;
}

return true;
}

function combineTranscriptChunks(){

const raw=
Array.isArray(result.transcript)
?result.transcript
:[];

const combined=[];

raw.forEach(item=>{

const text=
cleanTranscriptText(
item?.text||
item?.content||
""
);

if(!text){
return;
}

const speakerValue=
String(
item?.speaker||
item?.role||
""
).toLowerCase();

const isAI=
speakerValue==="ai"||
speakerValue==="interviewer"||
speakerValue==="assistant"||
speakerValue==="model";

const speaker=
isAI
?"ai"
:"candidate";

const last=
combined[combined.length-1];

if(
last&&
last.speaker===speaker
){

if(
shouldAddSpace(
last.text,
text
)
){
last.text+=` ${text}`;
}else{
last.text+=text;
}

}else{

combined.push({
speaker,
text
});

}
});

return combined;
}

function renderVoiceTranscript(){

if(!voiceTranscript){
return;
}

voiceTranscript.innerHTML="";

const combined=
combineTranscriptChunks();

if(!combined.length){

const empty=
document.createElement("div");

empty.className="transcript-empty";

empty.textContent=
"No transcript is available for this interview.";

voiceTranscript.appendChild(empty);

return;
}

combined.forEach(item=>{

const entry=
document.createElement("div");

entry.className=
`transcript-entry ${item.speaker}`;

const speaker=
document.createElement("div");

speaker.className=
"transcript-speaker";

speaker.textContent=
item.speaker==="ai"
?"AI Interviewer"
:"You";

const message=
document.createElement("div");

message.className=
"transcript-message";

message.textContent=
item.text;

entry.appendChild(speaker);
entry.appendChild(message);

voiceTranscript.appendChild(entry);

});
}

if(isVoiceInterview){

renderVoiceResult();

}else{

if(voicePerformance){
voicePerformance.style.display="none";
}

const answeredCount=
questions.filter(
question=>
(question.answer||"").trim()!==""
).length;

if(answeredQuestions){
answeredQuestions.textContent=
answeredCount;
}

if(totalQuestions){
totalQuestions.textContent=
questions.length;
}

if(answeredMessage){
answeredMessage.textContent=
answeredCount===questions.length
?"All Questions Answered"
:"Some Questions Unanswered";
}

if(answeredBarFill){
answeredBarFill.style.width=
questions.length
?`${(answeredCount/questions.length)*100}%`
:"0%";
}

const strengths=[];
const improvements=[];

evaluations.forEach(item=>{

const scoreValue=
Number(item.score)||0;

if(scoreValue>=8){

strengths.push(
item.feedback||
"Strong performance on this question."
);

}else if(scoreValue<=5){

improvements.push(
item.feedback||
"This area needs more improvement."
);

}
});

addListItems(
strengthsList,
strengths,
"Keep building on your strongest interview areas."
);

addListItems(
improvementsList,
improvements,
"Continue practicing to improve consistency."
);
}

const evaluationMap=
new Map(
evaluations.map(item=>[
Number(item.question_number),
item
])
);

function getScoreClass(scoreValue){

if(scoreValue>=8){
return"score-good";
}

if(scoreValue>=6){
return"score-medium";
}

return"score-low";
}

function getDifficultyClass(difficulty){

const value=
(difficulty||"").toLowerCase();

if(value==="easy"){
return"difficulty-easy";
}

if(value==="medium"){
return"difficulty-medium";
}

if(value==="hard"){
return"difficulty-hard";
}

return"";
}

function renderQuestions(limit=null){

if(!questionTableBody){
return;
}

questionTableBody.innerHTML="";

const visibleQuestions=
limit
?questions.slice(0,limit)
:questions;

visibleQuestions.forEach(
(question,index)=>{

const number=
Number(question.question_number)||
index+1;

const evaluation=
evaluationMap.get(number)||{};

const scoreValue=
Number(evaluation.score)||0;

const row=
document.createElement("tr");

const numberCell=
document.createElement("td");

numberCell.textContent=number;

const questionCell=
document.createElement("td");

questionCell.textContent=
question.question||
"Question unavailable.";

const difficultyCell=
document.createElement("td");

const difficulty=
document.createElement("span");

const difficultyValue=
question.difficulty||
"Not specified";

difficulty.className=
`difficulty-badge ${getDifficultyClass(difficultyValue)}`;

difficulty.textContent=
difficultyValue;

difficultyCell.appendChild(
difficulty
);

const scoreCell=
document.createElement("td");

scoreCell.className=
`question-score ${getScoreClass(scoreValue)}`;

scoreCell.textContent=
`${scoreValue} / 10`;

const feedbackCell=
document.createElement("td");

const feedbackButton=
document.createElement("button");

feedbackButton.type="button";

feedbackButton.className=
"feedback-btn";

feedbackButton.innerHTML=
'<i class="fa-regular fa-eye"></i><span>View</span>';

feedbackButton.addEventListener(
"click",
()=>{

if(feedbackQuestion){
feedbackQuestion.textContent=
question.question||
"Question unavailable.";
}

if(feedbackScore){
feedbackScore.textContent=
scoreValue;
}

if(feedbackAnswer){
feedbackAnswer.textContent=
question.answer||
"No answer recorded.";
}

if(feedbackText){
feedbackText.textContent=
evaluation.feedback||
"No feedback available.";
}

if(feedbackOverlay){
feedbackOverlay.classList.add("show");
}
}
);

feedbackCell.appendChild(
feedbackButton
);

row.appendChild(numberCell);
row.appendChild(questionCell);
row.appendChild(difficultyCell);
row.appendChild(scoreCell);
row.appendChild(feedbackCell);

questionTableBody.appendChild(row);

}
);
}

if(!isVoiceInterview){

renderQuestions(5);

if(
questions.length<=5
){

if(viewAllQuestionsBtn){
viewAllQuestionsBtn.style.display=
"none";
}

}else if(viewAllQuestionsBtn){

viewAllQuestionsBtn.addEventListener(
"click",
()=>{

const expanded=
questionTableBody.children.length===
questions.length;

if(expanded){

renderQuestions(5);

viewAllQuestionsBtn.innerHTML=
'<span>View All Questions</span><i class="fa-solid fa-chevron-down"></i>';

}else{

renderQuestions();

viewAllQuestionsBtn.innerHTML=
'<span>Show Fewer Questions</span><i class="fa-solid fa-chevron-up"></i>';

}
}
);
}

}else{

if(viewAllQuestionsBtn){
viewAllQuestionsBtn.style.display="none";
}
}

viewTranscriptBtn?.addEventListener(
"click",
()=>{

if(transcriptOverlay){

renderVoiceTranscript();

transcriptOverlay.classList.add("show");

document.body.style.overflow="hidden";
}
}
);

function closeTranscript(){

if(transcriptOverlay){
transcriptOverlay.classList.remove("show");
}

document.body.style.overflow="";
}

transcriptClose?.addEventListener(
"click",
closeTranscript
);

transcriptOverlay?.addEventListener(
"click",
event=>{

if(event.target===transcriptOverlay){
closeTranscript();
}

}
);

document.addEventListener(
"keydown",
event=>{

if(
event.key==="Escape"&&
transcriptOverlay?.classList.contains("show")
){
closeTranscript();
}

}
);

feedbackClose?.addEventListener(
"click",
()=>{
feedbackOverlay?.classList.remove("show");
}
);

feedbackOverlay?.addEventListener(
"click",
event=>{

if(event.target===feedbackOverlay){
feedbackOverlay.classList.remove("show");
}

}
);

viewInterviewsBtn?.addEventListener(
"click",
()=>{
window.location.href="interviews.html";
}
);

practiceAgainBtn?.addEventListener(
"click",
()=>{
sessionStorage.removeItem("interview_result");
window.location.href="practice.html";
}
);

backDashboardBtn?.addEventListener(
"click",
()=>{
window.location.href="dashboard.html";
}
);

downloadReportBtn?.addEventListener(
"click",
()=>{

const {jsPDF}=window.jspdf;

if(!jsPDF){
return;
}

const doc=new jsPDF();

const role=
result.target_role||
result.interview?.target_role||
"Not specified";

const experience=
result.experience_level||
result.interview?.experience_level||
"Not specified";

const interviewType=
result.interview_type||
result.interview?.interview_type||
"Not specified";

const duration=
result.duration_minutes
?`${result.duration_minutes} min`
:"Not available";

doc.setFillColor(
79,
70,
229
);

doc.rect(
0,
0,
210,
32,
"F"
);

doc.setTextColor(
255,
255,
255
);

doc.setFontSize(22);

doc.setFont(
"helvetica",
"bold"
);

doc.text(
"INTERVIA",
20,
15
);

doc.setFontSize(10);

doc.setFont(
"helvetica",
"normal"
);

doc.text(
"AI Interview Performance Report",
20,
23
);

doc.setTextColor(
23,
37,
84
);

doc.setFontSize(20);

doc.setFont(
"helvetica",
"bold"
);

doc.text(
isVoiceInterview
?"Voice Interview Result"
:"Interview Result",
20,
48
);

doc.setFontSize(10);

doc.setFont(
"helvetica",
"normal"
);

doc.setTextColor(
90,
100,
120
);

doc.text(
`Candidate: ${userName}`,
20,
58
);

doc.text(
`Role: ${role}`,
20,
65
);

doc.text(
`Experience: ${experience}`,
20,
72
);

doc.text(
`Interview Type: ${interviewType}`,
20,
79
);

doc.text(
`Duration: ${duration}`,
20,
86
);

doc.setFillColor(
247,
248,
252
);

doc.roundedRect(
20,
96,
170,
40,
4,
4,
"F"
);

doc.setTextColor(
23,
37,
84
);

doc.setFontSize(11);

doc.setFont(
"helvetica",
"bold"
);

doc.text(
"OVERALL SCORE",
30,
108
);

doc.setFontSize(25);

doc.text(
`${score}/100`,
30,
125
);

doc.setFontSize(11);

doc.text(
`Rating: ${rating}/5`,
100,
112
);

doc.setFont(
"helvetica",
"normal"
);

doc.setFontSize(10);

doc.text(
getScoreMessage(score),
100,
122
);

if(isVoiceInterview){

let y=153;

doc.setTextColor(
23,
37,
84
);

doc.setFontSize(14);

doc.setFont(
"helvetica",
"bold"
);

doc.text(
"Voice Interview Competencies",
20,
y
);

y+=9;

const competencyRows=[
[
"Communication",
`${getVoiceScore("communication")}%`
],
[
"Confidence",
`${getVoiceScore("confidence")}%`
],
[
"Technical Skills",
`${getVoiceScore("technical_skills")}%`
],
[
"Answer Structure",
`${getVoiceScore("answer_structure")}%`
]
];

doc.autoTable({
startY:y,
head:[
[
"Competency",
"Score"
]
],
body:competencyRows,
margin:{
left:20,
right:20
},
styles:{
font:"helvetica",
fontSize:9,
cellPadding:4,
textColor:[
55,
65,
81
]
},
headStyles:{
fillColor:[
79,
70,
229
],
textColor:[
255,
255,
255
],
fontStyle:"bold"
},
columnStyles:{
0:{
cellWidth:120
},
1:{
cellWidth:40
}
}
});

y=
doc.lastAutoTable.finalY+15;

doc.setTextColor(
23,
37,
84
);

doc.setFontSize(14);

doc.setFont(
"helvetica",
"bold"
);

doc.text(
"Performance Summary",
20,
y
);

y+=8;

doc.setFont(
"helvetica",
"normal"
);

doc.setFontSize(9);

doc.setTextColor(
80,
90,
110
);

const summaryLines=
doc.splitTextToSize(
result.summary||
"No summary available.",
170
);

doc.text(
summaryLines,
20,
y
);

}else{

doc.setTextColor(
23,
37,
84
);

doc.setFontSize(14);

doc.setFont(
"helvetica",
"bold"
);

doc.text(
"Performance Summary",
20,
153
);

doc.setFont(
"helvetica",
"normal"
);

doc.setFontSize(10);

doc.setTextColor(
80,
90,
110
);

const summaryLines=
doc.splitTextToSize(
result.summary||
"No summary available.",
170
);

doc.text(
summaryLines,
20,
163
);

let currentY=
163+
(summaryLines.length*5)+
12;

doc.setTextColor(
23,
37,
84
);

doc.setFontSize(14);

doc.setFont(
"helvetica",
"bold"
);

doc.text(
"Question-wise Performance",
20,
currentY
);

const tableData=
questions.map(
(question,index)=>{

const number=
Number(question.question_number)||
index+1;

const evaluation=
evaluationMap.get(number)||{};

const scoreValue=
Number(evaluation.score)||0;

return[
number,
question.question||
"Question unavailable.",
`${scoreValue}/10`
];

}
);

doc.autoTable({
startY:currentY+7,
head:[
[
"#",
"Question",
"Score"
]
],
body:tableData,
margin:{
left:20,
right:20
},
styles:{
font:"helvetica",
fontSize:8,
cellPadding:4,
textColor:[
55,
65,
81
]
},
headStyles:{
fillColor:[
79,
70,
229
],
textColor:[
255,
255,
255
],
fontStyle:"bold"
},
columnStyles:{
0:{
cellWidth:10
},
1:{
cellWidth:140
},
2:{
cellWidth:20
}
}
});

let finalY=
doc.lastAutoTable.finalY+15;

if(finalY>260){
doc.addPage();
finalY=20;
}

doc.setTextColor(
23,
37,
84
);

doc.setFontSize(13);

doc.setFont(
"helvetica",
"bold"
);

doc.text(
"AI Feedback",
20,
finalY
);

finalY+=8;

doc.setFont(
"helvetica",
"normal"
);

doc.setFontSize(9);

doc.setTextColor(
80,
90,
110
);

evaluations.forEach(
evaluation=>{

const question=
questions.find(
item=>
(
Number(item.question_number)||
0
)===
Number(
evaluation.question_number
)
);

if(!question){
return;
}

if(finalY>270){
doc.addPage();
finalY=20;
}

doc.setTextColor(
23,
37,
84
);

doc.setFont(
"helvetica",
"bold"
);

doc.text(
`Question ${evaluation.question_number} — ${evaluation.score}/10`,
20,
finalY
);

finalY+=5;

doc.setFont(
"helvetica",
"normal"
);

doc.setTextColor(
80,
90,
110
);

const feedbackLines=
doc.splitTextToSize(
evaluation.feedback||
"No feedback available.",
170
);

doc.text(
feedbackLines,
20,
finalY
);

finalY+=
(feedbackLines.length*4)+8;

}
);
}

const pageCount=
doc.getNumberOfPages();

for(
let page=1;
page<=pageCount;
page++
){

doc.setPage(page);

doc.setDrawColor(
220,
224,
232
);

doc.line(
20,
285,
190,
285
);

doc.setFontSize(8);

doc.setTextColor(
130,
140,
155
);

doc.text(
"Generated by Intervia AI Interview Simulator",
20,
292
);

doc.text(
`Page ${page} of ${pageCount}`,
165,
292
);
}

const safeName=
userName
.replace(
/[^a-z0-9]/gi,
"_"
)
.toLowerCase();

doc.save(
`intervia_${isVoiceInterview?"voice_":"interview_"}report_${safeName}.pdf`
);

}
);

});