/**
 * Authentication Middleware
 */

export const isAuthenticated = (req, res, next) => {
    if (req.session && req.session.isLoggedIn) {
        return next();
    }
    return res.redirect('/login');
};

export const isNotAuthenticated = (req, res, next) => {
    if (req.session && req.session.isLoggedIn) {
        return res.redirect('/dashboard');
    }
    return next();
};
