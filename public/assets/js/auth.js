// LOGIN
const loginForm = document.getElementById("loginForm");

if (loginForm) {

    loginForm.addEventListener("submit", async (e) => {

        e.preventDefault();

        const formData = new FormData(loginForm);

        const body = {
            email: formData.get("email"),
            password: formData.get("password")
        };

        const response = await fetch("/api/v1/users/login", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(body)
        });

        if (response.ok) {
            window.location.href = "/dashboard/farmerDashboard.html";
        }
    });
}


// REGISTER
const registerForm = document.getElementById("registerForm");

if (registerForm) {

    registerForm.addEventListener("submit", async (e) => {

        e.preventDefault();

        const formData = new FormData(registerForm);

        const response = await fetch("/api/v1/users/register", {
            method: "POST",
            body: formData
        });

        if (response.ok) {
            window.location.href = "/auth/login.html";
        }
    });
}