const cattleForm = document.getElementById("cattleForm");

if (cattleForm) {

    cattleForm.addEventListener("submit", async (e) => {

        e.preventDefault();

        const formData = new FormData(cattleForm);

        const body = {
            name: formData.get("name"),
            breed: formData.get("breed")
        };

        const response = await fetch(
            "/api/v1/farmer/cattles/add",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(body)
            }
        );

        if(response.ok){
            alert("Cattle Added");
        }
    });
}