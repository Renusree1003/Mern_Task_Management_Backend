require("dotenv").config();
require('./config/dbConfig.js');
//console.log(Object.keys(process.env));
const PORT = process.env.PORT || 1814;
const express = require("express");
const morgan = require("morgan");
const cors = require("cors");
const User = require("./models/userModel.js");
const { generateOTP } = require("./utils/otpHelper.js");
const { sendOtpEmail, sendReminderMail } = require("./utils/emailHelpers.js");
const OTP = require("./models/otpModel.js");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const Task = require("./models/taskModel.js");

const cron = require("node-cron");
cron.schedule('* * * * *', () => {
    console.log('running a task every minute');

    sendReminderMail("renusreemalapati@gmail.com", "Task 1");
  });
const app = express();

app.get("/", (req, res) => {
    res.send("<h1>Server is working</h1>");
});


app.use(
    cors({
        credentials: true,
        origin: process.env.FRONTEND_URL,
    })
);
app.use(express.json());


app.use((req, res, next) => {
    console.log("request received -->", req.url);
    next();
});
app.use(morgan("dev"));

app.get("/users", (req, res) => {
    try {

    } catch (err) {
        console.log("Error in GET /users");
        console.log(err.message);
        res.status(500);
        res.json({
            status: "fail",
            message: "Internal Server Error " + err.message,
        });
    }
});

app.post("/users/register", async (req, res) => {
    try {
        const { email, password, otp, fullName } = req.body;

        const otpDoc = await OTP.findOne({
            email: email,
        }).sort("-createdAt");

        if (!otpDoc) {
            res.status(400);
            res.json({
                status: "fail",
                message: "Email OTP is not sent to the given email or it is expired",
            });
            return;
        }
        //console.log(otpDoc);

        const { otp: hashedOtp } = otpDoc;
        const isOtpCorrect = await bcrypt.compare(otp.toString(), hashedOtp);
        if (!isOtpCorrect) {
            res.status(401);
            res.json({
                status: 'fail',
                message: 'Invalid otp',
            });
            return;
        }
        const hashedPassword = await bcrypt.hash(password, 14);
        const newUser = await User.create({
            email,
            password: hashedPassword,
            fullName,
        });
        res.status(201);
        res.json({
            status: "success",
            data: {
                user: {
                    email: newUser.email,
                    fullName: newUser.fullName,
                },
            },
        });
    } catch (err) {
        console.log("--- Error in /POST users ---");
        console.log(err.name, err.code);
        console.log(err.message);
        if (err.name === "ValidationError") {
            res.status(400);
            res.json({
                status: "fail",
                message: "Data validation failed" + err.essage,
            });
        } else if (err.code === 11000) {
            res.status(400);
            res.json({
                status: "fail",
                message: "Email already exists",
            });
        } else {
            res.status(500);
            res.json({
                status: "fail",
                message: "Internal Server Error",
            });
        }
    }
});

app.post("/otps", async (req, res) => {
    const { email } = req.body;
    if (!email) {
        res.status(400).json({
            status: "fail",
            message: 'Missing required parameter: "email"',
        });
        return;
    }

    const otp = generateOTP();

    const isEmailSent = await sendOtpEmail(email, otp);
    if (!isEmailSent) {
        res.status(500).json({
            status: "fail",
            message: "Email could not be sent",
        });
        return;
    }

    const newSalt = await bcrypt.genSalt(10);
    const hashedOtp = await bcrypt.hash(otp.toString(), newSalt);
    // console.log(newSalt);
    // console.log(otp, hashedOtp);

    await OTP.create({
        email,
        otp: hashedOtp,
    });
    res.status(201);
    res.json({
        status: "success",
        message: `OTP sent to ${email}`,
    });
});

app.post("/users/login", async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            res.status(400);
            res.json({
                status: "fail",
                message: "Email and password is required!",
            });
        }

        const currUser = await User.findOne({ email: email });
        console.log(" : currUser:", currUser);
        if (!currUser) {
            res.status(400);
            res.json({
                status: "fail",
                message: "User is not registered",
            });
            return;
        }
        const { password: hashedPassword, fullName, _id } = currUser;
        const isPasswordCorrect = await bcrypt.compare(password, hashedPassword);
        if (!isPasswordCorrect) {
            res.status(401);
            res.json({
                status: "fail",
                message: "Invalid email or password",
            });
            return;
        }

        const token = jwt.sign({
            email,
            _id,
            fullName,
        },
            process.env.JWT_SECRET_KEY,
            {
                expiresIn: "1d",
            }
        );

        res.cookie("authorization", token, {
            httpOnly: true,
            secure: true,
            sameSite: "None",
        });

        res.status(200);
        res.json({
            status: "success",
            message: "User logged in",
            data: {
                user: {
                    email,
                    fullName,
                },
            },
        });
    } catch (err) {
        console.log(err.message);
        res.status(500);
        res.json({
            status: "fail",
            message: "Internal server error",
        });
    }

});

app.use(cookieParser());
app.use((req, res, next) => {
    try {
        // validate the token
        //      get the token from cookies :: but express does not read the cookie by default (same like body)
        //      use a cookie-parser middleware // https://www.npmjs.com/package/cookie-parser

        const { authorization } = req.cookies;
        // we check if authorization key is present in request cookies or not
        if (!authorization) {
            res.status(401);
            res.json({
                status: "fail",
                message: "Authorization failed!",
            });
            return;
        }

        // if authorization cookie is present then verify the token
        jwt.verify(authorization, process.env.JWT_SECRET_KEY, (error, data) => {
            if (error) {
                // that means token is invalid (hacking attempt) or expired
                res.status(401);
                res.json({
                    status: "fail",
                    message: "Authorization failed!",
                });
            } else {
                console.log(data);
                req.currUser=data;
                next();
            }
        });
    } catch (err) {
        console.log("Error in validation middleware", err.message);
        res.status(500);
        res.json({
            status: "fail",
            message: "Internal Server Error",
        });
    }
});


app.post("/tasks", async (req, res) => {
    try {
        // 1. get the data from request
        const {assignor, ...taskInfo} = req.body;
        const {email} = req.currUser;
        taskInfo.assignor=email;
        //console.log(taskInfo);

        
        const newTask = await Task.create(taskInfo);

        res.status(201); //created
        res.json({
            status: "success",
            data: {
                task: newTask,
            },
        });
    } catch (err) {
        console.log("Error in POST /tasks", err.message);
        if (err.name === "ValidationError") {
            res.status(400).json({ status: "fail", message: err.message });
        } else if (err.code === 11000){
            res.status(400);
            res.json({ status: "fail", message: err.message });
        
        } else {
            res.status(500).json({ status: "fail", message: "Internal Server Error" });
        }
    }
});

app.get("/users/me", (req, res) => {
    try {
        const { email, fullName } = req.currUser;
        res.status(200);
        res.json({
            status: "success",
            data: {
                user: {
                    email,
                    fullName,
                },
            },
        });
    } catch (err) {
        console.log("error is GET /users/me", err.message);
        res.status(500);
        res.json({
            status: "fail",
            message: "INTERNAL SERVER ERROR",
        });
    }
});

app.get("/users/logout", (req, res) => {
    res.clearCookie("authorization");
    res.json({
        status: "success",
        message: "User is logged out",
    });
});

app.get("/tasks", async (req, res) => {
    try {
        const taskList = (await Task.find()).forEach([{assignor: req.currUser.email},{assignee: req.currUser.email}]);
        res.status(200);
        res.json({
            status: "success",
            data: {
                tasks: taskList,
            },
        });
    } catch (err) {
        console.log("error is GET /users/me", err.message);
        res.status(500);
        res.json({
            status: "fail",
            message: "INTERNAL SERVER ERROR",
        });
    }
});

app.listen(PORT, () => {
    console.log(`server started on PORT: ${PORT}`);
});

// const testing = async () => {
//     console.time("salt1");
//     const newSalt = await bcrypt.genSalt(10); // rounds-x == iterations pow(2,x)
//     console.timeEnd("salt1");
//     console.log(newSalt);
// };

// testing();