import jwt from "jsonwebtoken";

const JWT_SECRET = "mysecretkey";

export const verifyToken = (req, res, next) => {
  try {

    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        message: "Access Denied. No token provided"
      });
    }

    // Extract token from "Bearer TOKEN"
    const token = authHeader.split(" ")[1];

    const decoded = jwt.verify(token, JWT_SECRET);

    req.user = decoded;

    next();

  } catch (error) {
    return res.status(401).json({
      message: "Invalid Token"
    });
  }
};