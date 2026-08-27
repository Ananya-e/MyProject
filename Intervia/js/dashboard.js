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
async query(query,variables={}){
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

return result;
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
interviews:result.interviews||[],
scores:result.scores||[]
};
},

render(data){
const user=data.user;
if(!user){
localStorage.removeItem("user_id");
window.location.href="login.html";
return;
}
this.text("profileName",user.full_name||"User");
this.text("welcomeName",user.full_name||"User");
if(user.profile_image)this.attr("profileImage","src",user.profile_image);
this.renderResume(data.resume);
this.renderRole(user.target_role);
this.renderReadiness(data.interviews,data.scores);
this.renderRecent(data.interviews[0],data.scores);
this.renderProgress(data.interviews);
this.renderFocus(data.interviews,data.scores);
},
renderResume(resume){
if(!resume){
this.text("resumeName","No resume uploaded");
this.text("resumeDate","Upload your resume to get started");
return;
}
this.text("resumeName",resume.file_name);
this.text("resumeDate",`Uploaded on ${this.date(resume.uploaded_at)}`);
this.text("resumeStatus","✓");
},
renderRole(role){
this.text("targetRole",role||"Not selected");
},
renderReadiness(interviews,scores){
if(!interviews.length){
this.setSkill("communication",0);
this.setSkill("confidence",0);
this.setSkill("technical",0);
this.setSkill("structure",0);
this.text("overallReadiness","0%");
return;
}
const latest=interviews[0];
const score=scores.find(item=>item.interview_id===latest.id);
if(!score){
this.setSkill("communication",0);
this.setSkill("confidence",0);
this.setSkill("technical",0);
this.setSkill("structure",0);
this.text("overallReadiness",`${Math.round(Number(latest.overall_score)||0)}%`);
return;
}
const communication=Number(score.communication)||0;
const confidence=Number(score.confidence)||0;
const technical=Number(score.technical_skills)||0;
const structure=Number(score.answer_structure)||0;
const overall=Math.round((communication+confidence+technical+structure)/4);
this.setSkill("communication",communication);
this.setSkill("confidence",confidence);
this.setSkill("technical",technical);
this.setSkill("structure",structure);
this.text("overallReadiness",`${overall}%`);
},
setSkill(name,value){
this.text(`${name}Score`,`${Math.round(value)}%`);
const bar=document.getElementById(`${name}Bar`);
if(bar)bar.style.width=`${Math.min(100,Math.max(0,value))}%`;
},
renderRecent(interview,scores){
if(!interview){
this.text("recentInterviewDate","No interviews");
return;
}
this.text("recentInterviewDate",this.relativeDate(interview.completed_at||interview.created_at));
this.text("recentScore",`${Math.round(Number(interview.overall_score)||0)}%`);
this.text("recentType",interview.interview_type||"—");
this.text("recentDuration",interview.duration_minutes?`${interview.duration_minutes} mins`:"—");
this.text("recentQuestions",interview.questions_asked??"—");
const rating=Number(interview.rating)||0;
const stars="★".repeat(rating)+"☆".repeat(5-rating);
this.text("recentRating",stars);
},
renderProgress(interviews){
const chart=document.getElementById("progressChart");
if(!chart)return;
chart.innerHTML="";
const list=[...interviews].reverse();
if(!list.length)return;
list.forEach((interview,index)=>{
const point=document.createElement("div");
point.className="chart-point";
const score=Math.min(100,Math.max(0,Number(interview.overall_score)||0));
point.style.left=list.length===1?"50%":`${(index/(list.length-1))*100}%`;
point.style.bottom=`${score}%`;
point.innerHTML=`
<strong>${Math.round(score)}%</strong>
<span></span>
<small>Interview ${index+1}<br>${this.date(interview.completed_at||interview.created_at)}</small>
`;
chart.appendChild(point);
});
},
renderFocus(interviews,scores){
const container=document.getElementById("focusAreas");
container.innerHTML="";
if(!interviews.length){
container.innerHTML=`
<div class="focus-item">
<div class="focus-icon purple-bg">!</div>
<div class="focus-text">
<strong>Start your first interview</strong>
<p>Complete an interview to discover your improvement areas.</p>
</div>
<button type="button">Start</button>
</div>`;
return;
}
const latest=interviews[0];
const score=scores.find(item=>item.interview_id===latest.id);
if(!score)return;
const areas=[
{
name:"Answer Structure",
value:Number(score.answer_structure)||0,
description:"Improve how clearly and logically you structure your answers."
},
{
name:"Confidence",
value:Number(score.confidence)||0,
description:"Work on delivering your answers with greater confidence."
},
{
name:"Technical Depth",
value:Number(score.technical_skills)||0,
description:"Strengthen your technical explanations and examples."
}
];
areas.sort((a,b)=>a.value-b.value);
areas.forEach(area=>{
const item=document.createElement("div");
item.className="focus-item";
item.innerHTML=`
<div class="focus-icon purple-bg">!</div>
<div class="focus-text">
<strong>${this.escape(area.name)}</strong>
<p>${this.escape(area.description)}</p>
</div>
<button type="button">Improve</button>
`;
container.appendChild(item);
});
},
setupEvents(){
    const progressRange=document.getElementById("progressRange");

    if(progressRange){
        progressRange.addEventListener("change",async()=>{
            const data=await this.loadDashboard();
            if(data){
                this.renderProgress(data.interviews);
            }
        });
    }
},
text(id,value){
const element=document.getElementById(id);
if(element)element.textContent=value;
},
attr(id,name,value){
const element=document.getElementById(id);
if(element)element.setAttribute(name,value);
},
date(value){
if(!value)return"";
return new Date(value).toLocaleDateString("en-IN",{
day:"2-digit",
month:"short",
year:"numeric"
});
},
relativeDate(value){
if(!value)return"No interviews";
const days=Math.floor((Date.now()-new Date(value).getTime())/86400000);
if(days<=0)return"Today";
if(days===1)return"Yesterday";
return`${days} days ago`;
},
escape(value){
const div=document.createElement("div");
div.textContent=value??"";
return div.innerHTML;
}
};
document.addEventListener("DOMContentLoaded",()=>Dashboard.init());