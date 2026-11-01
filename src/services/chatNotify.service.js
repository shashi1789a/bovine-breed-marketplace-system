import { notify } from "./notification.service.js";

const preview = (message) => {
    if (message.type === "file") return message.text || "Sent you a file";
    if (message.type === "call") return "Missed video call";

    return String(message.text || "").slice(0, 120);
};

export const notifyNewMessage = async ({ recipientId, sender, message }) => {
    await notify(recipientId, {
        type: "new_message",
        title: `New message from ${sender.fullName}`,
        body: preview(message),
        link: `/chat?with=${sender.id || sender._id}`
    });
};
