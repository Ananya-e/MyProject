const resumeFile=document.getElementById("resumeFile");
const chooseFileBtn=document.getElementById("chooseFileBtn");
const uploadBtn=document.getElementById("uploadBtn");
const removeFileBtn=document.getElementById("removeFileBtn");
const replaceResumeBtn=document.getElementById("replaceResumeBtn");
const selectedFile=document.getElementById("selectedFile");
const fileName=document.getElementById("fileName");
const fileSize=document.getElementById("fileSize");
const analysisCard=document.getElementById("analysisCard");
const candidateName=document.getElementById("candidateName");
const experienceLevel=document.getElementById("experienceLevel");
const resumeSummary=document.getElementById("resumeSummary");
const skillsList=document.getElementById("skillsList");

let selectedResume=null;

const MAX_FILE_SIZE=10*1024*1024;
const allowedExtensions=[".pdf",".docx"];

chooseFileBtn.addEventListener("click",()=>resumeFile.click());

resumeFile.addEventListener("change",()=>{
    if(resumeFile.files.length){
        handleFile(resumeFile.files[0]);
    }
});

function handleFile(file){
    const extension="."+file.name.split(".").pop().toLowerCase();

    if(!allowedExtensions.includes(extension)){
        showToast("Please upload a PDF or DOCX file.","error");
        resetFile();
        return;
    }

    if(file.size>MAX_FILE_SIZE){
        showToast("Resume must be smaller than 10 MB.","error");
        resetFile();
        return;
    }

    selectedResume=file;
    fileName.textContent=file.name;
    fileSize.textContent=formatFileSize(file.size);
    selectedFile.hidden=false;
    uploadBtn.hidden=false;
    chooseFileBtn.hidden=true;
}

removeFileBtn.addEventListener("click",resetFile);

replaceResumeBtn.addEventListener("click",()=>{
    resetFile();
    resumeFile.click();
});

function resetFile(){
    selectedResume=null;
    resumeFile.value="";
    selectedFile.hidden=true;
    uploadBtn.hidden=true;
    chooseFileBtn.hidden=false;
    analysisCard.hidden=true;
}

function formatFileSize(bytes){
    if(bytes<1024*1024){
        return `${(bytes/1024).toFixed(1)} KB`;
    }
    return `${(bytes/(1024*1024)).toFixed(2)} MB`;
}

uploadBtn.addEventListener("click",async()=>{
    if(!selectedResume){
        showToast("Please select a resume first.","error");
        return;
    }

 const userId=localStorage.getItem("user_id");

if(!userId){
showToast("Please login again.","error");
window.location.href="login.html";
return;
}

const formData=new FormData();
formData.append("resume",selectedResume);
formData.append("user_id",userId);

    uploadBtn.disabled=true;
    uploadBtn.textContent="Analyzing...";

    try{
        const response=await fetch("http://127.0.0.1:5000/api/resume/parse",{
            method:"POST",
            body:formData
        });

        const data=await response.json();

        if(!response.ok){
            throw new Error(data.error||"Resume analysis failed.");
        }

        console.log("Intervia Resume Analysis:",data);

        displayResumeAnalysis(data.resume);

        showToast("Resume analyzed successfully.","success");
    }catch(error){
        console.error("Resume analysis error:",error);
        showToast(error.message||"Unable to analyze resume.","error");
    }finally{
        uploadBtn.disabled=false;
        uploadBtn.textContent="Upload & Analyze Resume";
    }
});

function displayResumeAnalysis(resume){
    analysisCard.hidden=false;

    const candidate=resume.candidate||{};

    candidateName.textContent=candidate.name||"Not detected";
    experienceLevel.textContent=resume.experience_level||"Not specified";
    resumeSummary.textContent=resume.professional_summary||"No professional summary detected.";

    skillsList.innerHTML="";

    const skills=Array.isArray(resume.skills)?resume.skills:[];

    if(skills.length){
        skills.forEach(skill=>{
            const tag=document.createElement("span");
            tag.className="skill-tag";
            tag.textContent=skill;
            skillsList.appendChild(tag);
        });
    }else{
        skillsList.innerHTML="<span>No skills detected.</span>";
    }

    analysisCard.scrollIntoView({
        behavior:"smooth",
        block:"start"
    });
}