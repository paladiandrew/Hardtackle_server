const express = require("express");
const bodyParser = require("body-parser");
const multer = require("multer");
const cors = require("cors");
require("dotenv").config();
const fs = require("fs");
const http = require("http");

const app = express();
const PORT = process.env.PORT || 8080;
app.use(
    cors({
        origin: "*",
        methods: ["GET", "POST", "PUT", "DELETE"],
        allowedHeaders: ["Content-Type", "Authorization"],
        maxAge: 3600,
    })
);

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
const server = http.createServer(app);

const io = require("socket.io")(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"],
    },
    transports: ["websocket", "polling"],
});
let users = [];
let baseUsers = [];
let cornerSectors = [];

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });
app.get("/", (req, res) => {
    res.send("It`s my server");
});

app.post("/api/upload_photo", upload.single("photo"), (req, res) => {
    const fileBuffer = req.file.buffer;
    const filePath = "./uploads/bg.png";
    fs.writeFileSync(filePath, fileBuffer);
    console.log(`Файл сохранен: ${filePath}`);
    res.send("Файл сохранен!");
});

app.get("/api/get_photo", (req, res) => {
    const filePath = "./uploads/bg.png";
    console.log("success");
    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.status(404).send("Фото не найдено");
        } else {
            res.set("Content-Type", "image/png");
            res.send(data);
        }
    });
});

app.post("/api/cornerSectors", (req, res) => {
    cornerSectors = req.body;
    res.sendStatus(200);
});
app.post("/api/cornerSectorsNew", (req, res) => {
    cornerSectors = req.body;

    // Вызываем функцию для обновления кругов
    adjustUsersAfterCornerSectorsUpdate();

    res.sendStatus(200);
});

app.post("/api/data", (req, res) => {
    const data = req.body;
    users = data.map((row, index) => ({
        user_name: row[0],
        code: row[1].toString(),
        player_id: row[2],
        total_user_points: 0,
        total_user_fish: 0,
        circles: row.slice(3).map((pair, i) => {
            const [opponent_number, sector] = pair;
            const opponent = data.find((r) => r[2] === opponent_number) || {};
            const opponent_name = opponent[0] || "Unknown Opponent";
            return {
                number: i + 1,
                status: i === 0 ? "active" : "inactive",
                index_circle: i + 1,
                second_circle: false,
                playerGame: {
                    approveState: 1,
                    number: row[2],
                    name: row[0],
                    fishCount: null,
                    points: 0,
                    total_points: 0,
                    sector: sector,
                },
                opponentGame: {
                    approveState: 1,
                    number: opponent_number,
                    name: opponent_name,
                    fishCount: null,
                    points: 0,
                    sector: sector,
                    total_points: 0,
                },
            };
        }),
    }));
    baseUsers = [...users];

    const usersWithEmptyName = users.filter(
        (user) => user.user_name === "Empty"
    );

    if (usersWithEmptyName.length > 0) {
        let finalNewUsers = users.map((user) => ({ ...user, circles: [] }));

        for (let i = 0; i < users[0].circles.length; i++) {
            let newUsers = users.map((user) => ({ ...user, circles: [] }));
            for (let j = 0; j < newUsers.length; j++) {
                const circle = users[j].circles[i];
                const newCircle = {
                    number: i + 1,
                    status: i === 0 ? "active" : "inactive",
                    index_circle: i + 1,
                    second_circle: false,
                    playerGame: circle.playerGame,
                    opponentGame: circle.opponentGame,
                };
                newUsers[j].circles.push(newCircle);
            }
            for (let j = 0; j < newUsers.length; j++) {
                const user = newUsers[j];
                const circle = newUsers[j].circles[0];
                if (circle.opponentGame.name === "Empty") {
                    const sectorEmpty = circle.opponentGame.sector;
                    const changeSectorEmpty = cornerSectors.includes(
                        sectorEmpty
                    )
                        ? 1
                        : -1;
                    let userNewOpponent;
                    let userNewOpponentIndex;
                    for (let k = 0; k < newUsers.length; k++) {
                        const opponent = newUsers[k];
                        if (
                            changeSectorEmpty === -1 &&
                            opponent.circles[0].playerGame.sector ===
                                sectorEmpty - 1 &&
                            opponent.player_id % 2 !== (i + 1) % 2
                        ) {
                            userNewOpponent = opponent;
                            userNewOpponentIndex = k;
                            break;
                        }
                    }
                    if (!userNewOpponent) {
                        for (let k = 0; k < newUsers.length; k++) {
                            const opponent = newUsers[k];
                            if (
                                changeSectorEmpty === 1 &&
                                opponent.circles[0].playerGame.sector ===
                                    sectorEmpty + 1 &&
                                opponent.player_id % 2 === (i + 1) % 2
                            ) {
                                userNewOpponent = opponent;
                                userNewOpponentIndex = k;
                                break;
                            }
                        }
                    }

                    if (userNewOpponent) {
                        const newCircleOpponent = {
                            number: i + 1,
                            index_circle: i + 1,
                            second_circle: true,
                            status: i === 0 ? "active" : "inactive",
                            playerGame: userNewOpponent.circles[0].playerGame,
                            opponentGame: circle.playerGame,
                        };
                        newUsers[userNewOpponentIndex].circles.push(
                            newCircleOpponent
                        );
                        newUsers[j].circles[0].opponentGame =
                            userNewOpponent.circles[0].playerGame;
                    } else {
                        console.log(
                            "Не найден оппонент для пользователя",
                            user.user_name
                        );
                    }
                }
            }
            for (let j = 0; j < newUsers.length; j++) {
                for (let k = 0; k < newUsers[j].circles.length; k++) {
                    finalNewUsers[j].circles.push(newUsers[j].circles[k]);
                }
            }
        }
        for (let j = 0; j < finalNewUsers.length; j++) {
            for (let k = 0; k < finalNewUsers[j].circles.length; k++) {
                const circle = finalNewUsers[j].circles[k];
                const newCircle = {
                    number: k + 1,
                    index_circle: circle.index_circle,
                    second_circle: circle.second_circle,
                    status: circle.status,
                    playerGame: circle.playerGame,
                    opponentGame: circle.opponentGame,
                };
                finalNewUsers[j].circles[k] = newCircle;
            }
        }
        users = finalNewUsers;
    }
    res.sendStatus(200);
});

function adjustUsersAfterCornerSectorsUpdate() {
    let lastActiveIndex = Math.max(
        0,
        ...users.map(
            (user) =>
                user.circles.reduce((maxIndex, circle) => {
                    // Проверка, что статус круг правильный и index_circle является числом
                    if (
                        (circle.status === "active" ||
                            circle.status === "completed") &&
                        typeof circle.index_circle === "number" &&
                        circle.index_circle > maxIndex
                    ) {
                        return circle.index_circle;
                    }
                    return maxIndex;
                }, 0) // Начальное значение аккумулятора
        )
    );
    // 1. Удаляем все неактивные круги у пользователей
    users.forEach((user) => {
        user.circles = user.circles.filter(
            (circle) => circle.status !== "inactive"
        );
    });
    // 3. Начинаем пересоздавать круги с индекса lastActiveIndex + 1
    let startIndex = lastActiveIndex;
    console.log(startIndex);
    console.log(baseUsers);
    // 4. Инициализация finalNewUsers с уже имеющимися кругами
    let finalNewUsers = users.map((user) => ({
        ...user,
        circles: [...user.circles],
    }));
    // 5. Пересоздаем круги с использованием логики из /api/data
    for (let i = startIndex; i < baseUsers[0].circles.length; i++) {
        let newUsers = users.map((user) => ({ ...user, circles: [] }));

        // Создаем новый круг для каждого пользователя
        for (let j = 0; j < newUsers.length; j++) {
            const circle = baseUsers[j].circles[i];
            const newCircle = {
                number: i + 1,
                status: "inactive",
                index_circle: i + 1,
                second_circle: false,
                playerGame: circle.playerGame,
                opponentGame: circle.opponentGame,
            };
            newUsers[j].circles.push(newCircle);
        }

        // Применяем логику для формирования second_circle
        for (let j = 0; j < newUsers.length; j++) {
            const user = newUsers[j];
            const circle = newUsers[j].circles[0];
            if (circle.opponentGame.name === "Empty") {
                const sectorEmpty = circle.opponentGame.sector;
                const changeSectorEmpty = cornerSectors.includes(sectorEmpty)
                    ? 1
                    : -1;

                let userNewOpponent;
                let userNewOpponentIndex;

                // Ищем оппонента согласно логике
                for (let k = 0; k < newUsers.length; k++) {
                    const opponent = newUsers[k];
                    if (
                        changeSectorEmpty === -1 &&
                        opponent.circles[0].playerGame.sector ===
                            sectorEmpty - 1 &&
                        opponent.player_id % 2 !== (i + 1) % 2
                    ) {
                        userNewOpponent = opponent;
                        userNewOpponentIndex = k;
                        break;
                    }
                }
                if (!userNewOpponent) {
                    for (let k = 0; k < newUsers.length; k++) {
                        const opponent = newUsers[k];
                        if (
                            changeSectorEmpty === 1 &&
                            opponent.circles[0].playerGame.sector ===
                                sectorEmpty + 1 &&
                            opponent.player_id % 2 === (i + 1) % 2
                        ) {
                            userNewOpponent = opponent;
                            userNewOpponentIndex = k;
                            break;
                        }
                    }
                }
                if (userNewOpponent) {
                    const newCircleOpponent = {
                        number: i + 1,
                        index_circle: i + 1,
                        second_circle: true,
                        status: "inactive",
                        playerGame: userNewOpponent.circles[0].playerGame,
                        opponentGame: circle.playerGame,
                    };
                    newUsers[userNewOpponentIndex].circles.push(
                        newCircleOpponent
                    );
                    newUsers[j].circles[0].opponentGame =
                        userNewOpponent.circles[0].playerGame;
                } else {
                    console.log(
                        "Не найден оппонент для пользователя",
                        user.user_name
                    );
                }
            }
        }

        // Добавляем новые круги в finalNewUsers
        for (let j = 0; j < newUsers.length; j++) {
            for (let k = 0; k < newUsers[j].circles.length; k++) {
                finalNewUsers[j].circles.push(newUsers[j].circles[k]);
            }
        }
    }

    finalNewUsers = finalNewUsers.map((user) => {
        return {
            ...user,
            circles: user.circles.map((circle, index) => ({
                ...circle,
                number: index + 1,
            })),
        };
    });

    users = [...finalNewUsers];

    // 7. Отправляем обновленные данные клиентам
    io.emit("allUsersUpdated", users);
}

app.get("/api/users", (req, res) => {
    res.json(users);
});

app.get("/api/user/:code", (req, res) => {
    const code = req.params.code.toString();
    const user = users.find((user) => user.code === code);
    console.log("success");
    if (user) {
        res.json(user);
    } else {
        res.status(404).json({ message: "Пользователь не найден" });
    }
});

app.get("/api/unready_players", (req, res) => {
    const usersForUnreadyPlayers = [...users];
    const unreadyPlayers = usersForUnreadyPlayers
        .filter(
            (user) =>
                user.user_name !== "Empty" &&
                user.circles.some(
                    (circle) =>
                        circle.status === "active" &&
                        circle.playerGame.approveState !== 4 &&
                        circle.playerGame.approveState !== 2
                )
        )
        .map((user) => `#${user.player_id} ${user.user_name}`);

    if (unreadyPlayers.length > 0) {
        res.json(unreadyPlayers);
    } else {
        res.json({ message: "Нет неготовых игроков" });
    }
});

app.get("/api/stats", (req, res) => {
    const usersStats = [...users];
    const resultArray = usersStats
        .filter((user) => user.user_name !== "Empty")
        .map((user) => {
            const circlePoints = user.circles
                .filter((circle) => !circle.second_circle)
                .map((circle) => circle.playerGame.points);
            return [
                user.player_id,
                user.user_name,
                user.total_user_points,
                user.total_user_fish,
                ...circlePoints,
            ];
        })
        .sort((a, b) => {
            if (a[2] === b[2]) {
                return b[3] - a[3];
            } else {
                return b[2] - a[2];
            }
        });

    res.json(resultArray);
});

app.get("/api/circles", (req, res) => {
    res.json(users.map((user) => user.circles));
});

app.post("/api/update-score", (req, res) => {
    const { userData, activeCircleNumber } = req.body;
    let updatedUserData = userData;

    // Получаем fishCount из текущего круга
    const circle = updatedUserData.circles.find(
        (circle) => circle.number === activeCircleNumber
    );
    const newFishCount = circle.playerGame.fishCount;

    // Находим индекс пользователя в массиве users
    const userIndex = users.findIndex(
        (user) => user.code === updatedUserData.code
    );
    if (userIndex === -1) {
        return res.status(404).json({ message: "User not found" });
    }

    // Обновляем fishCount во всех активных кругах пользователя
    updatedUserData.circles = updatedUserData.circles.map((c) => {
        if (c.status === "active") {
            c.playerGame.fishCount = newFishCount;
        }
        return c;
    });

    // Обновляем данные пользователя в массиве users
    users[userIndex] = updatedUserData;

    // Обновляем fishCount у оппонентов для всех активных кругов пользователя
    updatedUserData.circles.forEach((c) => {
        if (c.status === "active") {
            // Находим индекс оппонента в массиве users
            const opponentIndex = users.findIndex(
                (user) => user.player_id === c.opponentGame.number
            );
            if (opponentIndex !== -1) {
                // Находим соответствующий круг у оппонента
                const opponentCircleIndex = users[
                    opponentIndex
                ].circles.findIndex(
                    (oc) =>
                        oc.opponentGame.number === updatedUserData.player_id &&
                        oc.status === "active"
                );
                if (opponentCircleIndex !== -1) {
                    // Обновляем fishCount у оппонента
                    users[opponentIndex].circles[
                        opponentCircleIndex
                    ].opponentGame.fishCount = newFishCount;
                }
            }
        }
    });

    // Обновляем updatedUserData после изменений
    updatedUserData = users[userIndex];

    // Отправляем обновленные данные клиентам
    io.emit("userUpdated", { updatedUserData, activeCircleNumber });

    res.sendStatus(200);
});

app.post("/api/update-approve-state", (req, res) => {
    const { userData, activeCircleNumber } = req.body;
    let updatedUserData = userData;
    let needToCheckNewTour = false;
    const circle = updatedUserData.circles.find(
        (c) => c.number === activeCircleNumber
    );
    const userIndex = users.findIndex(
        (user) => user.code === updatedUserData.code
    );
    const opponentIndex = users.findIndex(
        (user) => user.player_id === circle.opponentGame.number
    );
    if (opponentIndex !== -1) {
        const opponent = users[opponentIndex];
        const opponentCircleIndex = opponent.circles.findIndex(
            (c) =>
                c.opponentGame.number === updatedUserData.player_id &&
                c.status === "active"
        );
        const playerCircleIndex = updatedUserData.circles.findIndex(
            (c) => c.number === circle.number
        );
        if (opponentCircleIndex !== -1) {
            opponent.circles[opponentCircleIndex].opponentGame.approveState =
                circle.playerGame.approveState;
            users[opponentIndex] = opponent;
            let playerApproveState = circle.playerGame.approveState;
            let playerOppApproveState = circle.playerGame.approveState;
            let opponentApproveState =
                opponent.circles[opponentCircleIndex].playerGame.approveState;
            let opponentOppApproveState =
                opponent.circles[opponentCircleIndex].opponentGame.approveState;

            if (playerApproveState === 1 && opponentApproveState === 1) {
                playerApproveState = 2;
                playerOppApproveState = 3;

                opponentApproveState = 3;
                opponentOppApproveState = 2;
            } else if (playerApproveState === 2 && opponentApproveState === 3) {
                playerApproveState = 1;
                playerOppApproveState = 1;

                opponentApproveState = 1;
                opponentOppApproveState = 1;
            } else if (playerApproveState === 3 && opponentApproveState === 2) {
                playerApproveState = 4;
                playerOppApproveState = 4;

                opponentApproveState = 4;
                opponentOppApproveState = 4;
                needToCheckNewTour = true;
            } else if (playerApproveState === 4 && opponentApproveState === 4) {
                playerApproveState = 3;
                playerOppApproveState = 2;

                opponentApproveState = 2;
                opponentOppApproveState = 3;
            } else {
                playerApproveState = 1;
                playerOppApproveState = 1;

                opponentApproveState = 1;
                opponentOppApproveState = 1;
            }
            users[userIndex].circles = users[userIndex].circles.map(
                (circle, index) => {
                    if (index === playerCircleIndex) {
                        return {
                            ...circle,
                            playerGame: {
                                ...circle.playerGame,
                                approveState: playerApproveState,
                            },
                            opponentGame: {
                                ...circle.opponentGame,
                                approveState: playerOppApproveState,
                            },
                        };
                    }
                    return circle;
                }
            );

            users[opponentIndex].circles = users[opponentIndex].circles.map(
                (circle, index) => {
                    if (index === opponentCircleIndex) {
                        return {
                            ...circle,
                            playerGame: {
                                ...circle.playerGame,
                                approveState: opponentApproveState,
                            },
                            opponentGame: {
                                ...circle.opponentGame,
                                approveState: opponentOppApproveState,
                            },
                        };
                    }
                    return circle;
                }
            );

            updatedUserData = { ...users[userIndex] };
        } else {
            console.error(
                `Active circle not found for opponent with player_id ${circle.opponentGame.number}`
            );
        }
    } else {
        console.error(
            `Opponent with player_id ${circle.opponentGame.number} not found`
        );
    }
    io.emit("userUpdated", { updatedUserData, activeCircleNumber });
    if (needToCheckNewTour) {
        checkAndUpdateRoundStatus();
    }
    res.sendStatus(200);
});

io.on("connection", (socket) => {
    socket.on("userUpdate", (data) => {
        const { updatedUserData, activeCircleNumber } = data;
        io.emit("userUpdated", { updatedUserData, activeCircleNumber });
    });

    socket.on("allUsersUpdated", (users) => {
        io.emit("allUsersUpdated", users);
    });

    socket.on("disconnect", () => {});
});

function checkAndUpdateRoundStatus() {
    let allCirclesApproved = true;
    users.forEach((user) => {
        user.circles.forEach((circle) => {
            if (
                circle.status === "active" &&
                circle.playerGame.approveState !== 4 &&
                circle.playerGame.name !== "Empty"
            ) {
                allCirclesApproved = false;
            }
        });
    });
    if (allCirclesApproved) {
        users.forEach((user, userIndex) => {
            const activeCircleIndex = user.circles.findIndex(
                (c) => c.status === "active"
            );
            if (activeCircleIndex !== -1) {
                let newRoundPoints = 0;
                const playerFish =
                    user.circles[activeCircleIndex].playerGame.fishCount;
                const opponentFish =
                    user.circles[activeCircleIndex].opponentGame.fishCount;
                if (playerFish === 0 && opponentFish === 0) {
                    newRoundPoints = 1;
                } else if (playerFish === opponentFish && playerFish > 0) {
                    newRoundPoints = 2;
                } else if (playerFish > opponentFish) {
                    newRoundPoints = 4;
                } else if (playerFish < opponentFish && playerFish > 0) {
                    newRoundPoints = 1;
                } else if (playerFish < opponentFish && playerFish === 0) {
                    newRoundPoints = 0;
                }
                users[userIndex].total_user_points =
                    users[userIndex].total_user_points + newRoundPoints;
                users[userIndex].total_user_fish =
                    users[userIndex].total_user_fish + playerFish;
                users[userIndex].circles[activeCircleIndex].playerGame.points =
                    newRoundPoints;
                users[userIndex].circles[
                    activeCircleIndex
                ].playerGame.total_points = users[userIndex].total_user_points;
                users.forEach((userOpponent, userIndexOpponent) => {
                    userOpponent.circles.forEach(
                        (circleOpponent, circleIndexOpponent) => {
                            if (
                                circleOpponent.opponentGame.number ===
                                user.player_id
                            ) {
                                if (circleOpponent.status === "active") {
                                    users[userIndexOpponent].circles[
                                        circleIndexOpponent
                                    ].opponentGame.points =
                                        users[userIndex].circles[
                                            activeCircleIndex
                                        ].playerGame.points;
                                }
                                users[userIndexOpponent].circles[
                                    circleIndexOpponent
                                ].opponentGame.total_points =
                                    users[userIndex].circles[
                                        activeCircleIndex
                                    ].playerGame.total_points;
                            } else if (
                                circleOpponent.playerGame.number ===
                                user.player_id
                            ) {
                                users[userIndexOpponent].circles[
                                    circleIndexOpponent
                                ].playerGame.total_points =
                                    users[userIndex].circles[
                                        activeCircleIndex
                                    ].playerGame.total_points;
                            }
                        }
                    );
                });
            }
        });
        /*
        Выше я для каждого пользователя сначала обновил его очки и рыбы глобально, затем всем его оппонентам в кругах обновил его данные об общих очках
        И если мы встретили текущего оппонента, ему обновляем наши points текущие для этого раунда
        Таким образом мы каждому игроку обновили его глобальные данные, данные в его кругах, данные о нем в кругах всех его оппонентов
        И после прохода по всем игрокам будет обновлена информация у всех про всех
        Ниже происходит обновление статуса кругов и emit в socket.
        */
        users.forEach((user, userIndex) => {
            const activeCircles = user.circles.filter(
                (c) => c.status === "active"
            );

            // Найти все неактивные круги
            const inactiveCircles = user.circles.filter(
                (c) => c.status === "inactive"
            );

            activeCircles.forEach((activeCircle) => {
                const nextCircleIndex = user.circles.indexOf(activeCircle) + 1;
                let nextInactiveCircleIndex;
                let secondInactiveCircle;
                if (nextCircleIndex < user.circles.length) {
                    const nextCircle = user.circles[nextCircleIndex];
                    if (nextCircle.status === "inactive") {
                        nextInactiveCircleIndex = nextCircleIndex + 1;
                        nextCircle.status = "active";
                        nextCircle.playerGame.approveState = 1;
                        nextCircle.opponentGame.approveState = 1;
                        nextCircle.playerGame.fishCount = null;
                        nextCircle.opponentGame.fishCount = null;
                    }
                }

                if (nextInactiveCircleIndex < user.circles.length) {
                    secondInactiveCircle =
                        user.circles[nextInactiveCircleIndex];
                }
                if (
                    secondInactiveCircle &&
                    secondInactiveCircle.second_circle
                ) {
                    if (secondInactiveCircle.status === "inactive") {
                        secondInactiveCircle.status = "active";
                        secondInactiveCircle.playerGame.approveState = 1;
                        secondInactiveCircle.opponentGame.approveState = 1;
                        secondInactiveCircle.playerGame.fishCount = "";
                        secondInactiveCircle.opponentGame.fishCount = "";
                    }
                }
            });

            activeCircles.forEach((activeCircle) => {
                activeCircle.status = "completed";
            });
        });
        io.emit("allUsersUpdated", users);
    }
}

app.post("/api/update_player_score", (req, res) => {
    const { stage_number, player_number, new_score } = req.body;

    // Валидация входных данных
    if (
        typeof stage_number !== "number" ||
        typeof player_number !== "number" ||
        typeof new_score !== "number" ||
        new_score < 0
    ) {
        return res.status(400).json({ message: "Invalid input data" });
    }

    // Поиск текущего пользователя
    const userIndex = users.findIndex(
        (user) => user.player_id === player_number
    );
    if (userIndex === -1) {
        return res.status(404).json({ message: "User not found" });
    }
    const user = users[userIndex];

    // Поиск кругов для обновления
    const circlesToUpdate = user.circles.filter(
        (circle) => circle.index_circle === stage_number
    );

    if (circlesToUpdate.length === 0) {
        return res.status(404).json({ message: "Stage not found for player" });
    }

    let totalPointsDifference = 0;
    let totalFishDifference = 0;

    circlesToUpdate.forEach((circle) => {
        const isSecondCircle = circle.second_circle;

        const prevPlayerPoints = circle.playerGame.points || 0;
        const prevFishCount = circle.playerGame.fishCount || 0;

        // Обновляем fishCount игрока
        circle.playerGame.fishCount = new_score;

        const opponentFishCount = circle.opponentGame.fishCount || 0;

        if (circle.status === "completed") {
            const { newPlayerPoints, newOpponentPoints } = calculatePoints(
                new_score,
                opponentFishCount
            );

            totalPointsDifference += newPlayerPoints - prevPlayerPoints;

            circle.playerGame.points = newPlayerPoints;
            circle.opponentGame.points = newOpponentPoints;

            totalFishDifference += new_score - prevFishCount;

            // Обновляем оппонента
            const opponentPlayerNumber = circle.opponentGame.number;
            const opponentIndex = users.findIndex(
                (u) => u.player_id === opponentPlayerNumber
            );
            if (opponentIndex !== -1) {
                const opponentUser = users[opponentIndex];

                const opponentCircles = opponentUser.circles.filter(
                    (c) =>
                        c.index_circle === stage_number &&
                        c.opponentGame.number === player_number
                );

                opponentCircles.forEach((opponentCircle) => {
                    // **Обновляем opponentGame.fishCount для круга оппонента**
                    opponentCircle.opponentGame.fishCount = new_score;

                    const isOpponentSecondCircle = opponentCircle.second_circle;

                    const prevOpponentPlayerPoints =
                        opponentCircle.playerGame.points || 0;
                    const prevOpponentFishCount =
                        opponentCircle.playerGame.fishCount || 0;

                    // Обновляем fishCount оппонента в его кругах
                    opponentCircle.playerGame.fishCount = new_score;

                    const {
                        newPlayerPoints: opNewPlayerPoints,
                        newOpponentPoints: opNewOpponentPoints,
                    } = calculatePoints(
                        opponentCircle.playerGame.fishCount,
                        opponentCircle.opponentGame.fishCount
                    );

                    if (!isOpponentSecondCircle) {
                        opponentUser.total_user_points +=
                            opNewPlayerPoints - prevOpponentPlayerPoints;
                        opponentUser.total_user_fish +=
                            opponentCircle.playerGame.fishCount -
                            prevOpponentFishCount;
                    }
                    opponentCircle.playerGame.points = opNewPlayerPoints;
                    opponentCircle.opponentGame.points = newPlayerPoints;
                    updateUserTotalPointsInCircles(opponentUser);
                });
            }
        } else {
            totalFishDifference += new_score - prevFishCount;
        }
    });

    // Обновляем общие очки и рыбу пользователя
    user.total_user_points += totalPointsDifference;
    user.total_user_fish += totalFishDifference;
    updateUserTotalPointsInCircles(user);

    // **Обновляем opponentGame.fishCount у всех оппонентов вне зависимости от статуса круга**
    updateOpponentsFishCount(stage_number, player_number, new_score);

    function calculatePoints(playerFish, opponentFish) {
        let newPlayerPoints = 0;
        let newOpponentPoints = 0;

        if (playerFish === 0 && opponentFish === 0) {
            newPlayerPoints = 1;
            newOpponentPoints = 1;
        } else if (playerFish === opponentFish && playerFish > 0) {
            newPlayerPoints = 2;
            newOpponentPoints = 2;
        } else if (playerFish > opponentFish) {
            newPlayerPoints = 4;
            newOpponentPoints = opponentFish > 0 ? 1 : 0;
        } else {
            newPlayerPoints = playerFish > 0 ? 1 : 0;
            newOpponentPoints = 4;
        }

        return { newPlayerPoints, newOpponentPoints };
    }

    function updateUserTotalPointsInCircles(updatedUser) {
        const updatedPlayerNumber = updatedUser.player_id;
        const updatedPlayerTotalPoints = updatedUser.total_user_points;

        updatedUser.circles.forEach((circle) => {
            if (circle.playerGame.number === updatedPlayerNumber) {
                circle.playerGame.total_points = updatedPlayerTotalPoints;
            }
            if (circle.opponentGame.number === updatedPlayerNumber) {
                circle.opponentGame.total_points =
                    updatedUser.total_user_points;
            }
        });
    }

    // **Новая функция для обновления opponentGame.fishCount у всех оппонентов**
    function updateOpponentsFishCount(stage_number, player_number, new_score) {
        users.forEach((user) => {
            user.circles.forEach((circle) => {
                if (
                    circle.index_circle === stage_number &&
                    circle.opponentGame.number === player_number
                ) {
                    // Обновляем opponentGame.fishCount только
                    circle.opponentGame.fishCount = new_score;

                    // Дополнительно, если необходимо, можно обновить и другие поля, например points
                    // Например:
                    // const { newPlayerPoints, newOpponentPoints } = calculatePoints(
                    //     circle.playerGame.fishCount,
                    //     new_score
                    // );
                    // circle.opponentGame.points = newOpponentPoints;
                }
            });
        });
    }

    // Отправляем обновлённые пользователи всем клиентам через WebSocket
    io.emit("allUsersUpdated", users);

    res.sendStatus(200);
});

server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
