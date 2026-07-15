# Architecture

QuizRoom is split into two apps:

- `client`: React SPA with pages for auth, dashboard, quiz editor, room host, play room and results.
- `server`: Express REST API plus Socket.IO server.

## REST API

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `GET /api/quizzes`
- `POST /api/quizzes`
- `GET /api/quizzes/:id`
- `PUT /api/quizzes/:id`
- `DELETE /api/quizzes/:id`
- `POST /api/quizzes/:id/questions`
- `PUT /api/quizzes/questions/:questionId`
- `DELETE /api/quizzes/questions/:questionId`
- `POST /api/rooms`
- `GET /api/rooms/:code`
- `GET /api/rooms/:code/results`
- `POST /api/uploads/question-image`
- `GET /api/profile/history`

## Socket.IO events

Client to server:

- `room:join`
- `room:start`
- `quiz:next-question`
- `quiz:submit-answer`
- `quiz:end`

Server to client:

- `room:state`
- `participant:joined`
- `quiz:question-started`
- `leaderboard:updated`
- `quiz:finished`

## Database entities

- `User`
- `Quiz`
- `Question`
- `AnswerOption`
- `Room`
- `RoomParticipant`
- `ParticipantAnswer`

Correct answers are stored only on the server and are not sent to participants while the quiz is running.
