const API_BASE_URL="http://127.0.0.1:5000";
let allInterviews=[];
let progressChart=null;

document.addEventListener("DOMContentLoaded",()=>{
loadUser();
loadProgress();
document.getElementById("progressRange")?.addEventListener("change",renderPage);
});

function getStoredUser(){
const stored=localStorage.getItem("user");
if(!stored){
return null;
}
try{
return JSON.parse(stored);
}catch(error){
return null;
}
}

function loadUser(){
const user=getStoredUser();

if(!user){
window.location.href="login.html";
return;
}

const name=user.full_name||user.name||"Candidate";
const profileImage=user.profile_image||"assets/profile-placeholder.png";

const profileName=document.getElementById("profileName");
const profileImageElement=document.getElementById("profileImage");

if(profileName){
profileName.textContent=name;
}

if(profileImageElement){
profileImageElement.src=profileImage;
}
}

async function loadProgress(){
const userId=localStorage.getItem("user_id");

if(!userId){
window.location.href="login.html";
return;
}

try{
const response=await fetch(`${API_BASE_URL}/api/progress?user_id=${encodeURIComponent(userId)}`);
const data=await response.json();

if(!response.ok||!data.success){
throw new Error(data.error||"Unable to load progress data.");
}

allInterviews=Array.isArray(data.interviews)?data.interviews:[];
renderPage();
}catch(error){
console.error("Progress error:",error);
allInterviews=[];
renderPage();
showToast("Unable to load your progress data.","error");
}
}

function getSelectedInterviews(){
const range=document.getElementById("progressRange")?.value||"6";

if(range==="all"){
return allInterviews;
}

const count=Number(range)||6;

return allInterviews.slice(-count);
}

function renderPage(){
const interviews=getSelectedInterviews();

renderStatistics(interviews);
renderOverview(interviews);
renderChart(interviews);
}

function renderStatistics(interviews){
const total=document.getElementById("totalInterviews");
const average=document.getElementById("averageScore");
const best=document.getElementById("bestScore");
const latest=document.getElementById("latestScore");

if(total){
total.textContent=allInterviews.length;
}

if(!interviews.length){
if(average){
average.textContent="0%";
}
if(best){
best.textContent="0%";
}
if(latest){
latest.textContent="0%";
}
return;
}

const scores=interviews.map(item=>getScore(item));
const averageScore=scores.reduce((sum,value)=>sum+value,0)/scores.length;
const bestScore=Math.max(...scores);
const latestScore=scores[scores.length-1];

if(average){
average.textContent=`${formatScore(averageScore)}%`;
}

if(best){
best.textContent=`${formatScore(bestScore)}%`;
}

if(latest){
latest.textContent=`${formatScore(latestScore)}%`;
}
}

function renderOverview(interviews){
const performanceLevel=document.getElementById("performanceLevel");
const improvementValue=document.getElementById("improvementValue");
const highestRating=document.getElementById("highestRating");
const latestInterviewType=document.getElementById("latestInterviewType");
const progressMessage=document.getElementById("progressMessage");

if(!performanceLevel||!improvementValue||!highestRating||!latestInterviewType||!progressMessage){
return;
}

if(!interviews.length){
performanceLevel.textContent="Getting Started";
improvementValue.textContent="0%";
highestRating.textContent="—";
latestInterviewType.textContent="—";
progressMessage.textContent="Complete your first interview to start building your performance history.";
updateTrendBadge(0,0);
return;
}

const scores=interviews.map(item=>getScore(item));
const firstScore=scores[0];
const latestScore=scores[scores.length-1];
const improvement=latestScore-firstScore;

const ratings=interviews
.map(item=>Number(item.rating)||0)
.filter(value=>value>0);

const highest=ratings.length?Math.max(...ratings):0;

performanceLevel.textContent=getPerformanceLevel(latestScore);
improvementValue.textContent=`${improvement>0?"+":""}${formatScore(improvement)}%`;
highestRating.textContent=highest?`${highest}/5`:"—";
latestInterviewType.textContent=formatInterviewType(interviews[interviews.length-1].interview_type);

if(interviews.length===1){
progressMessage.textContent="Complete more interviews to see how your performance changes over time.";
}else if(improvement>0){
progressMessage.textContent=`Your latest score is ${formatScore(improvement)}% higher than your first score in this selected range.`;
}else if(improvement<0){
progressMessage.textContent=`Your latest score is ${formatScore(Math.abs(improvement))}% lower than your first score in this selected range. Keep practicing for consistency.`;
}else{
progressMessage.textContent="Your performance is currently stable. Continue practicing to build stronger consistency.";
}

updateTrendBadge(
interviews.length>1?latestScore-scores[scores.length-2]:0,
interviews.length
);
}

function updateTrendBadge(difference,count){
const badge=document.getElementById("trendBadge");
const icon=badge?.querySelector("i");
const text=badge?.querySelector("span");

if(!badge||!icon||!text){
return;
}

if(!count){
icon.className="fa-solid fa-minus";
text.textContent="No data";
return;
}

if(count===1){
icon.className="fa-solid fa-minus";
text.textContent="First interview";
return;
}

if(difference>0){
icon.className="fa-solid fa-arrow-trend-up";
text.textContent=`+${formatScore(difference)}%`;
}else if(difference<0){
icon.className="fa-solid fa-arrow-trend-down";
text.textContent=`${formatScore(difference)}%`;
}else{
icon.className="fa-solid fa-minus";
text.textContent="No change";
}
}

function renderChart(interviews){
const canvas=document.getElementById("progressChart");
const empty=document.getElementById("chartEmpty");

if(!canvas||!empty){
return;
}

if(progressChart){
progressChart.destroy();
progressChart=null;
}

if(!interviews.length){
canvas.style.display="none";
empty.style.display="flex";
return;
}

canvas.style.display="block";
empty.style.display="none";

const labels=interviews.map((item,index)=>`Interview ${index+1}`);
const scores=interviews.map(item=>getScore(item));

progressChart=new Chart(canvas,{
type:"line",
data:{
labels,
datasets:[{
data:scores,
borderColor:"#6842e8",
backgroundColor:"rgba(104,66,232,.10)",
borderWidth:2.5,
pointBackgroundColor:"#6842e8",
pointBorderColor:"#fff",
pointBorderWidth:2,
pointRadius:4,
pointHoverRadius:6,
fill:true,
tension:.35
}]
},
options:{
responsive:true,
maintainAspectRatio:false,
interaction:{
intersect:false,
mode:"index"
},
plugins:{
legend:{
display:false
},
tooltip:{
backgroundColor:"#10234b",
titleFont:{
family:"DM Sans",
size:11
},
bodyFont:{
family:"DM Sans",
size:11
},
padding:10,
displayColors:false,
callbacks:{
label:context=>`Score: ${formatScore(context.parsed.y)}%`
}
}
},
scales:{
y:{
min:0,
max:100,
ticks:{
stepSize:25,
font:{
family:"DM Sans",
size:10
},
color:"#687791",
callback:value=>`${value}%`
},
grid:{
color:"#e8ecf3"
},
border:{
display:false
}
},
x:{
ticks:{
font:{
family:"DM Sans",
size:10
},
color:"#687791"
},
grid:{
color:"#eef1f6"
},
border:{
display:false
}
}
}
}
});
}

function getScore(interview){
return Math.max(0,Math.min(100,Number(interview.overall_score)||0));
}

function getPerformanceLevel(score){
if(score>=90){
return"Excellent";
}

if(score>=80){
return"Strong Performance";
}

if(score>=70){
return"Good Progress";
}

if(score>=60){
return"Developing";
}

if(score>0){
return"Needs Practice";
}

return"Getting Started";
}

function formatInterviewType(value){
if(!value){
return"—";
}

return String(value)
.replace(/_/g," ")
.replace(/\b\w/g,char=>char.toUpperCase());
}

function formatScore(value){
const number=Number(value)||0;

if(Number.isInteger(number)){
return number.toString();
}

return number.toFixed(1);
}

function showToast(message,type="info"){
if(typeof window.showToast==="function"){
window.showToast(message,type);
}
}