document.addEventListener("DOMContentLoaded",()=>{
const result=JSON.parse(sessionStorage.getItem("interview_result")||"null");

if(!result){
window.location.href="practice.html";
return;
}

const user=JSON.parse(localStorage.getItem("user")||"null");
const userName=localStorage.getItem("user_name")||user?.full_name||user?.name||"User";

const questions=result.questions||[];
const evaluations=result.evaluations||[];

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
const circleScore=document.getElementById("circleScore");
const performanceSummary=document.getElementById("performanceSummary");
const strengthsList=document.getElementById("strengthsList");
const improvementsList=document.getElementById("improvementsList");
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

profileName.textContent=userName;
profileAvatar.textContent=userName.charAt(0).toUpperCase();

resultRole.textContent=result.target_role||"Not specified";
resultExperience.textContent=result.experience_level||"Not specified";

const type=result.interview_type||result.interview?.interview_type||"full";
resultType.textContent=type.replace(/_/g," ").replace(/\b\w/g,char=>char.toUpperCase());

const completedAt=result.interview?.completed_at||new Date().toISOString();
resultDate.textContent=new Date(completedAt).toLocaleString([],{
day:"2-digit",
month:"short",
year:"numeric",
hour:"2-digit",
minute:"2-digit"
});

const score=Number(result.overall_score)||0;
const rating=Number(result.rating)||0;

overallScore.textContent=score;
scoreBarFill.style.width=`${Math.min(score,100)}%`;
circleScore.textContent=`${score}%`;
document.querySelector(".score-circle").style.setProperty("--score",`${Math.min(score,100)}%`);

function getScoreMessage(value){
if(value>=90)return"Outstanding Performance!";
if(value>=80)return"Great Performance!";
if(value>=70)return"Good Performance!";
if(value>=60)return"Fair Performance";
return"Needs Improvement";
}

scoreMessage.textContent=getScoreMessage(score);

ratingValue.textContent=rating;
ratingMessage.textContent=rating>=4.5?"Excellent":rating>=4?"Very Good":rating>=3?"Good":rating>=2?"Needs Improvement":"Poor";

ratingStars.innerHTML="";

for(let i=1;i<=5;i++){
const star=document.createElement("i");
star.className=`fa-solid fa-star${i<=Math.round(rating)?" active":""}`;
ratingStars.appendChild(star);
}

const answeredCount=questions.filter(question=>(question.answer||"").trim()!=="").length;

answeredQuestions.textContent=answeredCount;
totalQuestions.textContent=questions.length;
answeredMessage.textContent=answeredCount===questions.length?"All Questions Answered":"Some Questions Unanswered";
answeredBarFill.style.width=questions.length?`${(answeredCount/questions.length)*100}%`: "0%";

const durationMinutes=Number(result.duration_minutes);

if(Number.isFinite(durationMinutes)&&durationMinutes>0){
timeTaken.textContent=`${durationMinutes} min`;
}else{
timeTaken.textContent="—";
}

performanceSummary.textContent=result.summary||"Your interview evaluation has been completed.";

const scoreValues=evaluations.map(item=>Number(item.score)||0);

const strengths=[];
const improvements=[];

evaluations.forEach(item=>{
const scoreValue=Number(item.score)||0;

if(scoreValue>=8){
strengths.push(item.feedback||"Strong performance on this question.");
}else if(scoreValue<=5){
improvements.push(item.feedback||"This area needs more improvement.");
}
});

function addListItems(list,items,fallback){
list.innerHTML="";

const unique=[...new Set(items)].slice(0,4);

if(!unique.length){
const li=document.createElement("li");
li.textContent=fallback;
list.appendChild(li);
return;
}

unique.forEach(item=>{
const li=document.createElement("li");
li.textContent=item;
list.appendChild(li);
});
}

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

const evaluationMap=new Map(
evaluations.map(item=>[
Number(item.question_number),
item
])
);

function getScoreClass(scoreValue){
if(scoreValue>=8)return"score-good";
if(scoreValue>=6)return"score-medium";
return"score-low";
}

function getDifficultyClass(difficulty){
const value=(difficulty||"").toLowerCase();

if(value==="easy")return"difficulty-easy";
if(value==="medium")return"difficulty-medium";
if(value==="hard")return"difficulty-hard";

return"";
}

function renderQuestions(limit=null){
questionTableBody.innerHTML="";

const visibleQuestions=limit?questions.slice(0,limit):questions;

visibleQuestions.forEach((question,index)=>{
const number=Number(question.question_number)||index+1;
const evaluation=evaluationMap.get(number)||{};
const scoreValue=Number(evaluation.score)||0;

const row=document.createElement("tr");

const numberCell=document.createElement("td");
numberCell.textContent=number;

const questionCell=document.createElement("td");
questionCell.textContent=question.question||"Question unavailable.";

const difficultyCell=document.createElement("td");
const difficulty=document.createElement("span");
const difficultyValue=question.difficulty||"Not specified";

difficulty.className=`difficulty-badge ${getDifficultyClass(difficultyValue)}`;
difficulty.textContent=difficultyValue;
difficultyCell.appendChild(difficulty);

const scoreCell=document.createElement("td");
scoreCell.className=`question-score ${getScoreClass(scoreValue)}`;
scoreCell.textContent=`${scoreValue} / 10`;

const feedbackCell=document.createElement("td");
const feedbackButton=document.createElement("button");

feedbackButton.type="button";
feedbackButton.className="feedback-btn";
feedbackButton.innerHTML='<i class="fa-regular fa-eye"></i><span>View</span>';

feedbackButton.addEventListener("click",()=>{
feedbackQuestion.textContent=question.question||"Question unavailable.";
feedbackScore.textContent=scoreValue;
feedbackAnswer.textContent=question.answer||"No answer recorded.";
feedbackText.textContent=evaluation.feedback||"No feedback available.";
feedbackOverlay.classList.add("show");
});

feedbackCell.appendChild(feedbackButton);

row.appendChild(numberCell);
row.appendChild(questionCell);
row.appendChild(difficultyCell);
row.appendChild(scoreCell);
row.appendChild(feedbackCell);

questionTableBody.appendChild(row);
});
}

renderQuestions(5);

if(questions.length<=5){
viewAllQuestionsBtn.style.display="none";
}else{
viewAllQuestionsBtn.addEventListener("click",()=>{
const expanded=questionTableBody.children.length===questions.length;

if(expanded){
renderQuestions(5);
viewAllQuestionsBtn.innerHTML='<span>View All Questions</span><i class="fa-solid fa-chevron-down"></i>';
}else{
renderQuestions();
viewAllQuestionsBtn.innerHTML='<span>Show Fewer Questions</span><i class="fa-solid fa-chevron-up"></i>';
}
});
}

feedbackClose.addEventListener("click",()=>{
feedbackOverlay.classList.remove("show");
});

feedbackOverlay.addEventListener("click",event=>{
if(event.target===feedbackOverlay){
feedbackOverlay.classList.remove("show");
}
});

viewInterviewsBtn.addEventListener("click",()=>{
window.location.href="interviews.html";
});

practiceAgainBtn.addEventListener("click",()=>{
sessionStorage.removeItem("interview_result");
window.location.href="practice.html";
});

backDashboardBtn.addEventListener("click",()=>{
window.location.href="dashboard.html";
});

downloadReportBtn.addEventListener("click",()=>{
const {jsPDF}=window.jspdf;

if(!jsPDF){
showToast("PDF generator is not available.");
return;
}
const doc=new jsPDF();

const score=Number(result.overall_score)||0;
const rating=Number(result.rating)||0;
const role=result.target_role||"Not specified";
const experience=result.experience_level||"Not specified";
const type=result.interview_type||result.interview?.interview_type||"Not specified";
const duration=result.duration_minutes?`${result.duration_minutes} min`:"Not available";

doc.setFillColor(79,70,229);
doc.rect(0,0,210,32,"F");

doc.setTextColor(255,255,255);
doc.setFontSize(22);
doc.setFont("helvetica","bold");
doc.text("INTERVIA",20,15);

doc.setFontSize(10);
doc.setFont("helvetica","normal");
doc.text("AI Interview Performance Report",20,23);

doc.setTextColor(23,37,84);
doc.setFontSize(20);
doc.setFont("helvetica","bold");
doc.text("Interview Result",20,48);

doc.setFontSize(10);
doc.setFont("helvetica","normal");
doc.setTextColor(90,100,120);

doc.text(`Candidate: ${userName}`,20,58);
doc.text(`Role: ${role}`,20,65);
doc.text(`Experience: ${experience}`,20,72);
doc.text(`Interview Type: ${type}`,20,79);
doc.text(`Duration: ${duration}`,20,86);

doc.setFillColor(247,248,252);
doc.roundedRect(20,96,170,40,4,4,"F");

doc.setTextColor(23,37,84);
doc.setFontSize(11);
doc.setFont("helvetica","bold");
doc.text("OVERALL SCORE",30,108);

doc.setFontSize(25);
doc.text(`${score}/100`,30,125);

doc.setFontSize(11);
doc.text(`Rating: ${rating}/5`,100,112);

doc.setFont("helvetica","normal");
doc.setFontSize(10);
doc.text(
score>=80?"Strong overall performance":
score>=60?"Satisfactory performance":
"Needs improvement",
100,
122
);

doc.setTextColor(23,37,84);
doc.setFontSize(14);
doc.setFont("helvetica","bold");
doc.text("Performance Summary",20,153);

doc.setFont("helvetica","normal");
doc.setFontSize(10);
doc.setTextColor(80,90,110);

const summaryLines=doc.splitTextToSize(
result.summary||"No summary available.",
170
);

doc.text(summaryLines,20,163);

let currentY=163+(summaryLines.length*5)+12;

doc.setTextColor(23,37,84);
doc.setFontSize(14);
doc.setFont("helvetica","bold");
doc.text("Question-wise Performance",20,currentY);

const tableData=questions.map((question,index)=>{
const number=Number(question.question_number)||index+1;
const evaluation=evaluationMap.get(number)||{};
const scoreValue=Number(evaluation.score)||0;

return[
number,
question.question||"Question unavailable.",
`${scoreValue}/10`
];
});

doc.autoTable({
startY:currentY+7,
head:[["#","Question","Score"]],
body:tableData,
margin:{left:20,right:20},
styles:{
font:"helvetica",
fontSize:8,
cellPadding:4,
textColor:[55,65,81]
},
headStyles:{
fillColor:[79,70,229],
textColor:[255,255,255],
fontStyle:"bold"
},
columnStyles:{
0:{cellWidth:10},
1:{cellWidth:140},
2:{cellWidth:20}
}
});

let finalY=doc.lastAutoTable.finalY+15;

if(finalY>260){
doc.addPage();
finalY=20;
}

doc.setTextColor(23,37,84);
doc.setFontSize(13);
doc.setFont("helvetica","bold");
doc.text("AI Feedback",20,finalY);

finalY+=8;

doc.setFont("helvetica","normal");
doc.setFontSize(9);
doc.setTextColor(80,90,110);

evaluations.forEach((evaluation,index)=>{
const question=questions.find(
item=>(Number(item.question_number)||index+1)===Number(evaluation.question_number)
);

if(!question)return;

if(finalY>270){
doc.addPage();
finalY=20;
}

doc.setTextColor(23,37,84);
doc.setFont("helvetica","bold");
doc.text(
`Question ${evaluation.question_number} — ${evaluation.score}/10`,
20,
finalY
);

finalY+=5;

doc.setFont("helvetica","normal");
doc.setTextColor(80,90,110);

const feedbackLines=doc.splitTextToSize(
evaluation.feedback||"No feedback available.",
170
);

doc.text(feedbackLines,20,finalY);

finalY+=feedbackLines.length*4+8;
});

const pageCount=doc.getNumberOfPages();

for(let page=1;page<=pageCount;page++){
doc.setPage(page);

doc.setDrawColor(220,224,232);
doc.line(20,285,190,285);

doc.setFontSize(8);
doc.setTextColor(130,140,155);
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

const safeName=userName
.replace(/[^a-z0-9]/gi,"_")
.toLowerCase();

doc.save(`intervia_interview_report_${safeName}.pdf`);
});
});