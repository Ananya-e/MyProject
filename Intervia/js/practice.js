document.addEventListener("DOMContentLoaded", () => {
  const startBtn=document.getElementById("startInterviewBtn"),
toast=document.getElementById("toast"),
userName=document.getElementById("userName"),
userAvatar=document.getElementById("userAvatar"),
resumeName=document.getElementById("resumeName"),
resumeState=document.getElementById("resumeState"),
typeCards=document.querySelectorAll(".type-card"),
questionButtons=document.querySelectorAll(".question-options button"),
targetRole=document.getElementById("targetRole"),
experienceLevel=document.getElementById("experienceLevel"),
questionCountText=document.getElementById("questionCountText"),
timeText=document.getElementById("timeText");
  let selectedType = "technical",
    selectedCount = 15;
  function showToast(message) {
    toast.textContent = message;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 3000);
  }
  function getUser() {
    try {
      return JSON.parse(localStorage.getItem("user") || "null");
    } catch {
      return null;
    }
  }
  function loadUser() {
    const user = getUser();
    const name =
      localStorage.getItem("user_name") ||
      user?.name ||
      user?.full_name ||
      "Candidate";
    userName.textContent = name;
    userAvatar.textContent = name.charAt(0).toUpperCase();
  }
  function checkResume() {
    const saved = localStorage.getItem("resume_analysis");
    if (saved) {
      try {
        const data = JSON.parse(saved);
        const resume = data.resume || data;
        resumeName.textContent = resume.file_name || "Analyzed Resume";
        resumeState.textContent = "Analyzed";
        return;
      } catch {}
    }
    resumeName.textContent = "No resume uploaded";
    resumeState.textContent = "Upload a resume first";
    resumeState.style.color = "#d83a3a";
  }
  function updateQuestionInfo() {
    questionCountText.textContent = `${selectedCount} questions`;
    const times = {
      5: "10–15 minutes",
      10: "20–25 minutes",
      15: "30–40 minutes",
      20: "40–50 minutes",
    };
    timeText.textContent = `Estimated time: ${times[selectedCount]}`;
  }

  typeCards.forEach((card) =>
    card.addEventListener("click", () => {
      typeCards.forEach((c) => c.classList.remove("selected"));
      card.classList.add("selected");
      selectedType = card.dataset.type;
    }),
  );
  questionButtons.forEach((button) =>
    button.addEventListener("click", () => {
      questionButtons.forEach((b) => b.classList.remove("selected"));
      button.classList.add("selected");
      selectedCount = Number(button.dataset.count);
      updateQuestionInfo();
    }),
  );

  startBtn.addEventListener("click", async () => {
    const userId = localStorage.getItem("user_id");
    if (!userId) {
      showToast("Please login again.");
      return;
    }
    const resumeExists = resumeState.textContent === "Analyzed";
    if (!resumeExists) {
      showToast("Please upload and analyze your resume first.");
      return;
    }
    startBtn.disabled = true;
    startBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i><span>Preparing Interview...</span>';
    try {
      const response = await fetch(
        "http://127.0.0.1:5000/api/interview/start",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: userId,
            target_role: targetRole.value,
            experience_level: experienceLevel.value,
            interview_type: selectedType,
            question_count: selectedCount,
          }),
        },
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Unable to start interview.");
      sessionStorage.setItem("current_interview", JSON.stringify(data));
      window.location.href = "interview.html";
    } catch (error) {
      console.error("Interview start error:", error);
      showToast(error.message || "Unable to start interview.");
      startBtn.disabled = false;
      startBtn.innerHTML = '<i class="fa-solid fa-play"></i><span>Start Interview</span>';
    }
  });
  loadUser();
  checkResume();
  updateQuestionInfo();
});
