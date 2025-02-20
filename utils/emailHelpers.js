const nodemailer = require("nodemailer");
const transporter = nodemailer.createTransport({
    service: "gmail",

    host: "smtp.gmail.com",
    auth: {
        user: process.env.SEND_MAIL_GMAIL_ACCOUNT,
        pass: process.env.SEND_MAIL_GMAIL_ACCOUNT_PASSWORD,
    },
});
//console.log("hello from email helper");
const sendEmail = async (to, subject, html) => {
    console.log("hello from email helper");
    try {
        const info = await transporter.sendMail({
            from: '"Task Management Tool" <cloudfile2004@gmail.com>',
            to,
            subject,
            html,
        });
        console.log(info.messageId);
        return true;
    } catch (err) {
        console.log("Error occurred in sendEmail");
        console.log(err.message);
        return false;
    }
};

const sendOtpEmail = async (email, otp) => {
    console.log("send otp email");
    const isEmailSent = await sendEmail(
        email,
        "OTP verification from task management tool",
        `<p>your otp is <span style="color:brown">${otp}</span></p>`
    );
    return isEmailSent;
};

const sendReminderMail = async (email, task) => {
    console.log("send otp email");
    const isEmailSent = await sendEmail(
        email,
        "task reminder",
        `<p>Tour task is pending ${task}</p>`
    );
    return isEmailSent;
};

    module.exports = {
        sendOtpEmail,
        sendReminderMail
    };