const productForm = document.getElementById("productForm");

if (productForm) {

    productForm.addEventListener("submit", async (e) => {

        e.preventDefault();

        const formData = new FormData(productForm);

        const response = await fetch(
            "/api/v1/products/add",
            {
                method: "POST",
                body: formData
            }
        );

        const data = await response.json();

        alert(data.message);
    });
}