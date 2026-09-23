async function loadCart() {

    const response = await fetch("/cart");

    const data = await response.json();

    const cartDiv = document.getElementById("cartItems");

    data.cart.items.forEach(item => {

        cartDiv.innerHTML += `
            <div>
                <h2>${item.product.name}</h2>
                <p>${item.quantity}</p>
            </div>
        `;
    });
}

loadCart();