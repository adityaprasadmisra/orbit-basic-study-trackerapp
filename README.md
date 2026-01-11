# Orbit | Daily Study Tracker (SQLite Version)

A premium, database-backed web application to track your daily study progress, specifically tailored for your engineering curriculum.

## Features
- **Dashboard**: Visual progress of all your courses (Embedded Systems, DSP, etc.)
- **Daily Log**: Track lectures, DSA problems (LeetCode), GRE words, and daily practices.
- **Strict Mode**: LeetCode verification via API to ensure you solved problems today.
- **Database Persistence**: Uses SQLite to store your records permanently.
- **Analytics**: Weekly activity charts and distribution graphs.

## Setup & Run

Since this version uses a real database, you need to run the server.

1. **Install Dependencies** (First time only):
   ```powershell
   npm install
   ```

2. **Start the Application**:
   ```powershell
   npm start
   ```

3. **Open in Browser**:
   Go to: [http://localhost:3000](http://localhost:3000)

## Technologies
- **Frontend**: HTML5, CSS3, Vanilla JS
- **Backend**: Node.js, Express
- **Database**: SQLite3
- **APIs**: LeetCode Status API (alfa-leetcode-api)

## Troubleshooting
- If `npm start` fails, ensure you have Node.js installed (`node -v`).
- If data isn't saving, check the terminal for error messages.
