# ims-backend
<!-- redeploy trigger -->


[![Node.js](https://img.shields.io/badge/Node.js-v14.17.4-brightgreen.svg)](https://nodejs.org/)
[![Express.js](https://img.shields.io/badge/Express.js-v4.17.1-lightgrey.svg)](https://expressjs.com/)
[![MongoDB](https://img.shields.io/badge/MongoDB-v5.0-blue.svg)](https://www.mongodb.com/)
[![Mongoose](https://img.shields.io/badge/Mongoose-v6.0.3-yellow.svg)](https://mongoosejs.com/)
[![JWT](https://img.shields.io/badge/JSON%20Web%20Tokens-v8.5.1-orange.svg)](https://jwt.io/)

This is the backend part of the IMS (Inventory Management System) project, implemented using the MERN (MongoDB, Express.js, React, Node.js) stack.

## Project Overview

The IMS backend provides the server-side functionality for the IMS application, which addresses the challenges faced by the department in managing inventory and material procurement efficiently. The system streamlines the process of material requisition, procurement, and consumption tracking across multiple branches and employees. It offers the following key functionalities:

- Online Material Requisition: Branches can request various types of materials online, replacing the manual process.
- Inventory Management: The system tracks and manages the inventory of stationery and other items efficiently.
- Consumption Reports: Generate consumption reports, both branchwise and employeewise, to monitor and analyze material usage.

## Project Overview

The IMS backend provides the server-side functionality for the IMS application, which addresses the challenges faced by the department in managing inventory and material procurement efficiently. The system streamlines the process of material requisition, procurement, and consumption tracking across multiple branches and employees. It offers the following key functionalities:

- Online Material Requisition: Branches can request various types of materials online, replacing the manual process.
- Inventory Management: The system tracks and manages the inventory of stationery and other items efficiently.
- Consumption Reports: Generate consumption reports, both branchwise and employeewise, to monitor and analyze material usage.

## Project Overview

The IMS backend provides the server-side functionality for the IMS application, which addresses the challenges faced by the department in managing inventory and material procurement efficiently. The system streamlines the process of material requisition, procurement, and consumption tracking across multiple branches and employees. It offers the following key functionalities:

- Online Material Requisition: Branches can request various types of materials online, replacing the manual process.
- Inventory Management: The system tracks and manages the inventory of stationery and other items efficiently.
- Consumption Reports: Generate consumption reports, both branchwise and employeewise, to monitor and analyze material usage.



## Features

- User registration and login with JWT authentication.
- API endpoints for managing material requisitions, inventory, and consumption data.
- Middleware for request handling, including error handling and authentication.

## Getting Started

### Prerequisites

- Node.js (v14.17.4)
- MongoDB (v5.0) running on your local machine or a remote server.
- Environment variables configured (e.g., for MongoDB connection and JWT secret).

### Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/yourusername/IMS-BACKEND.git
   cd IMS--BACKEND
Install dependencies:

bash
Copy code
npm install
Configure your environment variables. Create a .env file in the project root and set the necessary variables:

dotenv
Copy code
MONGODB_URI=your_mongodb_connection_string
JWT_SECRET=your_jwt_secret_key
Start the server:

bash
Copy code
npm start
The server should be running on http://localhost:4469 by default.
