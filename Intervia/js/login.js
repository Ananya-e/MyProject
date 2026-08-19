const loginForm = document.getElementById("loginForm");
const password = document.getElementById("password");
const togglePassword = document.getElementById("togglePassword");

togglePassword.addEventListener("click", () => {
  password.type = password.type === "password" ? "text" : "password";
});

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("email").value.trim();
  const passwordValue = password.value;
  if (!email || !passwordValue) return;
  try {
    const response = await fetch("http://127.0.0.1:5000/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: passwordValue }),
    });
    const result = await response.json();
    if (result.success) {
      localStorage.setItem("user", JSON.stringify(result.user));
      localStorage.setItem("user_id", result.user.id);
      showToast("Login successful","success");
      setTimeout(() => (window.location.href = "dashboard.html"), 1000);
    } else {
      showToast(result.message||"Invalid email or password","error");
    }
  } catch (error) {
    showToast("Cannot connect to the server","error");
  }
});
