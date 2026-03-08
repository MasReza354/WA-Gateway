import express from "express";
import expressLayout from "express-ejs-layouts";
import flash from "connect-flash";
import session from "express-session";
import fileUpload from "express-fileupload";

import routerUser from "../router/session/session.router.js";
import routerDashboard from "../router/dashboard/dashboard.router.js";
import routerApi from "../router/api/api.router.js";
import routerAutoReply from "../router/dashboard/AutoReply/autoReply.router.js";
import { isAuthenticated, isNotAuthenticated } from "../middleware/auth.js";

class App {
	constructor() {
		this.app = express();
		this.plugins();
		this.route();
		this.PORT = process.env.PORT || 8080;
	}

	plugins() {
		this.app.set("trust proxy", 1);
		this.app.set("view engine", "ejs");
		this.app.use(expressLayout);
		this.app.use(express.static("public"));
		this.app.use(express.urlencoded({ extended: true }));
		this.app.use(express.json());
		this.app.use(session({ 
			secret: "wa-gate-secret-key-2026", 
			resave: false, 
			saveUninitialized: false, 
			cookie: { 
				maxAge: 24 * 60 * 60 * 1000 // 24 hours
			} 
		}));
		this.app.use(flash());
		this.app.use(function (req, res, next) {
			res.locals.success_msg = req.flash("success_msg");
			res.locals.error_msg = req.flash("error_msg");
			res.locals.side = req.flash("side");
			res.locals.url = req.originalUrl;
			res.locals.isLoggedIn = req.session.isLoggedIn || false;
			res.locals.username = req.session.username || null;
			next();
		});
		this.app.use(
			fileUpload({
				fileSize: 10 * 1024 * 1024,
			})
		);
	}

	route() {
		// Public routes
		this.app.get("/", (req, res) => {
			if (req.session.isLoggedIn) {
				return res.redirect("/dashboard");
			}
			return res.redirect("/login");
		});

		// Login page
		this.app.get("/login", isNotAuthenticated, (req, res) => {
			res.render("login", { layout: false, error: null });
		});

		// Login handler
		this.app.post("/login", isNotAuthenticated, (req, res) => {
			const { username, password } = req.body;
			const adminUsername = process.env.ADMIN_USERNAME || "admin";
			const adminPassword = process.env.ADMIN_PASSWORD || "admin123";

			if (username === adminUsername && password === adminPassword) {
				req.session.isLoggedIn = true;
				req.session.username = username;
				return res.redirect("/dashboard");
			} else {
				return res.render("login", { layout: false, error: "Username atau password salah!" });
			}
		});

		// Logout handler
		this.app.get("/logout", (req, res) => {
			req.session.destroy((err) => {
				if (err) {
					console.log(err);
				}
				res.redirect("/login");
			});
		});

		// Protected routes - require authentication
		this.app.use("/dashboard", isAuthenticated, routerDashboard);
		this.app.use("/session", isAuthenticated, routerUser);
		this.app.use("/reply", isAuthenticated, routerAutoReply);
		
		// API routes - no auth required (for external integrations)
		this.app.use("/api", routerApi);
	}
}

export default App;
