import { IGameState,  EMoveTypes, IMoveInfo, EMoveDirections, IPoint, ISnake } from "./types";
import { getIndexOfValue } from "./util";
import * as _ from "lodash";

/*
Every time our app is asked for a move, we receive a "request body" that contains all the information about the board
at that time. This request body takes the form of a Javascript literal as text. (JSON).

The idea behind this class is that every time a new JSON object is sent up to us (in index.ts) the FIRST thing we do is
give the state to this class. We can then call the methods within this class from anywhere in the program, and we can start
answering questions about particular points or snakes or other game data such as board width, etc. (ALL of the informaiton that
the game holders would let us know at this point.)

Notice that everything in this class is static, there does not need to be multiple representations of present gamestate at this time,
i.e. there is no need to construct different instances of this. Just import and you're good to go with all the methods you need.
*/

export class StateAnalyzer {
    // The current game state (same shape as request body, ie IGameState)
    static gameState: IGameState;

    private constructor(){

    }

    // Cal this method right away when you know about a new game state
    static update(newState: IGameState) {
        StateAnalyzer.gameState = newState;
    }

    // What turn is it?
    static getTurn() {
        return StateAnalyzer.gameState.turn;
    }

    // Where is my snake's head? What IPoint?
    static getMyPosition() {
        return StateAnalyzer.gameState.you.body[0];
    }

    // What is the name of my snake?
    static getMyName() {
        return StateAnalyzer.gameState.you.name;
    }

    // Give me an array of objects, each object contains all info on a snake ie health 
    static getSnakes() {
        return StateAnalyzer.gameState.board.snakes;
    }

    // How long am I?
    static getMyLength() {
        return StateAnalyzer.gameState.you.body.length;
    }

    // Give me an array of all the points containing food
    static getFoodPoints() {
        return StateAnalyzer.gameState.board.food;
    }

    // How tall is the board?
    static getBoardHeight = () => {
        return StateAnalyzer.gameState.board.height;
    }

    // How wide?
    static getBoardWidth = () => {
        return StateAnalyzer.gameState.board.width;
    }

    // How long is a snake?
    static getSnakeLength = (name: string) => {
        const snake = StateAnalyzer.gameState.board.snakes.filter((snake: ISnake) => snake.name == name)[0];
        return snake.body.length;
    }

    // You give me a point, I'll give you an array of four points back (left, right, up, down)
    static getRectilinearNeighbors(XY: IPoint): IPoint[] {
        const x = XY.x;
        const y = XY.y;

        return [
            {x: x - 1, y}, // left cell
            {x: x + 1, y}, // right cell
            {x, y: y + 1}, // down cell
            {x, y: y - 1} // up cell
        ];
    }

    // This one is fancy, and very helpful for determining the safety of a move.
    // Give me the name of a snake and a move it wants to make ("up" or "left" etc)
    // And I will give you some info about that move
    // See IMoveInfo to see what the shape of this return data looks like
    static moveInfo (snakeName: string, move: EMoveDirections): IMoveInfo {

        // The move info must always have a ".status" property, which must be one of
        // EmoveTypes.unknown (or just "unknown" as a string if you prefer, tomayto tomahto)
        // "uncontested" - empty and safe
        // "contested" - empty but possibly dangerous (will also include an array of snake sizes contesting)
        // "wall" - splat
        // "body" - sploot

        // The return value of this function is defined first as unknown. It will only ever return unknown as the type
        // If theres a bug
        const returnVal: IMoveInfo = { status: EMoveTypes.unknown };

        const snake = StateAnalyzer.gameState.board.snakes.filter((snake: ISnake) => snake.name == snakeName)[0];
        const { x, y } = snake.body[0];

        const newXY = move == "up" ? {x, y: y - 1} :
                    move == "right" ? {x: x + 1, y} :
                    move == "down" ? {x, y: y + 1} :
                    move == "left" ? {x: x - 1, y} : undefined;

        if (newXY == undefined) {
        throw "Move " + move + " not recognized";
        }

        const newX = newXY.x;
        const newY = newXY.y;

        // The XY that we are looking at has been determined using "left" or whatever
        // Logging checkpoint

        console.log(this.getTurn());
        console.log("My position: " + JSON.stringify(this.getMyPosition()));
        console.log("considering spot: " + JSON.stringify(newXY));

        // Check if its a wall
        if (newX >= this.gameState.board.width
        || newX < 0
        || newY >= this.gameState.board.height
        || newY < 0) {
            if (returnVal.status == EMoveTypes.unknown) returnVal.status = EMoveTypes.wall;
            console.log("Move found to collide with wall");
        }

        // Check if it's a part of any snake body
        this.gameState.board.snakes.forEach((boardSnake: ISnake) => {
        for (let i = 0; i < boardSnake.body.length; i++) {
        if (_.isEqual(boardSnake.body[i], newXY)) {
            if (returnVal.status == EMoveTypes.unknown) {
                returnVal.status = EMoveTypes.body;
            }
            if (i == 0) {
                // special note that body point is a head
                returnVal.head = true;
            }
            console.log("Move found to collide with body of snake: " + boardSnake.name);
        }
        }
        });

        // Check if it's contested
        const neighbors = StateAnalyzer.getRectilinearNeighbors(newXY);

        StateAnalyzer.gameState.board.snakes.forEach((boardSnake: ISnake) => {
        if (boardSnake.name != snakeName) {
            // console.log("Checking snake " + boardSnake.name);
            // console.log("Considering point " + JSON.stringify(newXY));
            // console.log("neighbors of this point: " + JSON.stringify(neighbors));
            // console.log("Snake head is at" + JSON.stringify(boardSnake.body[0]));
            // console.log("getIndexOfValue(neighbors, boardSnake.body[0]) == " + getIndexOfValue(neighbors, boardSnake.body[0]));
            if (getIndexOfValue(neighbors, boardSnake.body[0]) > -1) {
                console.log("Move found to be contested by: " + boardSnake.name);
                if (returnVal.status == EMoveTypes.unknown) returnVal.status = EMoveTypes.contested;
                if (!returnVal.snakeLengths) {
                    returnVal.snakeLengths = [];
                }
                returnVal.snakeLengths.push(boardSnake.body.length);
                console.log("returnVal.snakeLengths == " + returnVal.snakeLengths);
            }
        }
        });

        // If we still haven't changed it from unknown, the status 
        if (returnVal.status == EMoveTypes.unknown) {
        returnVal.status = EMoveTypes.uncontested;
        console.log("Move is free and uncontested");
        }

        // Also put in if the point is in the food list.
        // Notice the getIndexOfValue function returns -1 when it can't find the index in the list
        returnVal.food = getIndexOfValue(this.gameState.board.food, newXY) > -1;

        return returnVal;
    }

    // what move do I need to get from the start point to the finish point?
    // "up"? "right"?
    static getMove (start: IPoint, finish: IPoint): EMoveDirections {
        const dx = finish.x - start.x;
        const dy = finish.y - start.y;
        if (dx == 1) {
            return EMoveDirections.right;
        } else if (dx == -1) {
            return EMoveDirections.left;
        } else if (dy == 1) {
            return EMoveDirections.down;
        } else if (dy == -1) {
            return EMoveDirections.up;
        }
    }

    // Another fun one. This function suggests a move that our snake could do based on the current board.
    // It will suggest moves in the following priority:
    // 1. A spot that a smaller snake is looking at or could also move to
    // 2. An empty, uncontested spot
    // 3. A spot that is contested... D:
    // 4. An enemy snakes head, if he he's trapped he might do the same and we can take a bastard down with us.
    // 5. ...up?  good luck
    static safeMove(): EMoveDirections {
        console.log("SAFEMOVE DEFAULT ENGAGED");
        const myName = StateAnalyzer.getMyName();
        const moves = [EMoveDirections.left, EMoveDirections.right, EMoveDirections.up, EMoveDirections.down];
        const moveInfos: IMoveInfo[] = [];

        // Basically we just get the move infos for each neighbor
        moves.forEach((move) => {
        moveInfos.push(StateAnalyzer.moveInfo(myName, move));
        });

        // Check the move infos multiple times over, return out and finish if we find something
        for (let i = 0; i < 4; i++) {
        if (moveInfos[i].status == EMoveTypes.contested) {
            if (StateAnalyzer.getMyLength() > Math.max(...moveInfos[i].snakeLengths)) {
                console.log("Taking point contested by smaller snake by moving: " + moves[i]);
                // Best pickins
                return moves[i];
            }
        }
        }

        // Check the moves again for a second-best options
        for (let i = 0; i < 4; i++) {
        if (moveInfos[i].status == EMoveTypes.uncontested) {
            console.log("Taking uncontested point by moving: " + moves[i]);
            // Will do fine
            return moves[i];
        }
        }

        // Oh shit we still haven't found something?
        for (let i = 0; i < 4; i++) {
        if (moveInfos[i].status == EMoveTypes.contested) {
            console.log("Taking contested point that might not end so well: " + moves[i]);
            // Scraping the bottom of the barrell...
            return moves[i];
        }
        }
    
        // AAAAAAAAAHHH! ( I added a special move info property called head to make this work )
        for (let i = 0; i < 4; i++) {
        if (moveInfos[i].head) {
            // AAAAAAAAAAAAAAAAAAAHHH!!!
            console.log("Last resort kamikaze move into another snake head: " + moves[i]);
            return moves[i];
        }
        }

        // Welp!
        console.log("No safe move could be found, defaulting to up. Sorry snakey :[");
        return EMoveDirections.up;
    }

    // Is this point next to food?
    static nextToFood(point: IPoint): boolean {
        const foodPoints = StateAnalyzer.getFoodPoints();
        const neighbors = StateAnalyzer.getRectilinearNeighbors(point);
        let returnVal = false;
        // For each neighboring point is it in the food list blah blah
        neighbors.forEach((neighborPoint) => {
        if (getIndexOfValue(foodPoints, neighborPoint) > -1) {
            returnVal = true;
            return;
        }
        });
        return returnVal;
    }

    // Is this point next to a snake that's bigger than us?
    static pointIsContestedByLargerSnake (point: IPoint): boolean {
        const myName = StateAnalyzer.getMyName();
        const neighbors = StateAnalyzer.getRectilinearNeighbors(point);
        let returnVal = false;
        StateAnalyzer.getSnakes().forEach((snake) => {
        if (snake.name != myName) {
            // console.log("checking snake " + snake.name);
            // console.log("point neighbors are" + JSON.stringify(neighbors));
            // console.log("snake head is at " + JSON.stringify(snake.body[0]));
            if (getIndexOfValue(neighbors, snake.body[0]) > -1) {
                console.log("snake head was found in neighbor list");
                if (snake.body.length >= StateAnalyzer.getMyLength()) {
                    console.log("snake is too large to ignore");
                    returnVal = true;
                    return;
                }
            }
        }
        });
        return returnVal;
    }

    // Juse give me all the snake body points concatted together in one array for my convenience please
    static getTakenPoints() {
        let returnArr: IPoint[] = [];
        StateAnalyzer.getSnakes().forEach((snake) => {
        returnArr = returnArr.concat(snake.body);
        });
        return returnArr;
    }

    // Is this point a part of a snake body?
    static pointIsTaken(point: IPoint) {
        const takenPoints = StateAnalyzer.getTakenPoints();
        return (getIndexOfValue(takenPoints, point) > -1);
    }
}