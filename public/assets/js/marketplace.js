async function loadProducts() {

    const response = await fetch(
        "/marketplace"
    );

    const data = await response.json();

    const productsDiv = document.getElementById("products");

    data.products.forEach(product => {

        productsDiv.innerHTML += `
            <div>
                <h2>${product.name}</h2>
                <p>${product.price}</p>

                <button onclick="addToCart('${product._id}')">
                    Add To Cart
                </button>
            </div>
        `;
    });
}


async function addToCart(id) {

    await fetch(`/cart/add/${id}`, {
        method: "POST"
    });

    alert("Added To Cart");
}

loadProducts();