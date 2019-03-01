import { StateAnalyzer } from "./StateAnalyzer";
import { request } from "http";
import * as data from "../data/data";
import { SnakeLogger } from "../util/SnakeLogger";
import { TailDodger } from "./TailDodger" ;
import { getIndexOfValue } from "../util/helpers";
import { IGameState,  ECellContents, IMoveInfo, EMoveDirections, IPoint, ISnake, IBoard, IScoredPath } from "./types";
import * as _ from "lodash";

export const MoveGenerator = class {
    selfProximityWeight = 5;
    foodProximityWeight = 35;
    centreProximityWeight = 35;
    agressionWeight = 25;
    avoidanceWeight = 20;
    // pathPromises: Promise<IPoint[]>[] = [];
    paths: IPoint[][] = [];
    foodPath: IPoint[] = [];
    agressionPath: IPoint[] = [];
    nonAvoidancePath: IPoint[] = [];
    dodger = new TailDodger(StateAnalyzer.getMyPosition());

    height = StateAnalyzer.getBoardHeight();
    width = StateAnalyzer.getBoardWidth();

    stepReferenceScalar = this.height + this.width;

    startMs: number;
    endPoints: IPoint[];

    constructor() {
        SnakeLogger.info("Constructing MoveGenerator - Generating all paths");
        this.startMs = new Date().getTime();
        // const endPointList = StateAnalyzer.get50NearestPoints();
        this.endPoints = StateAnalyzer.getAllPoints();
    }

    async generateMove(): Promise<EMoveDirections> {
        SnakeLogger.info("Starting generateMove");
        try {
            const bestPath = await this.bestPath();
            SnakeLogger.info("target xy: " + JSON.stringify(bestPath[bestPath.length - 1]));
            SnakeLogger.info("path projection: " + JSON.stringify(bestPath));
            return StateAnalyzer.getMove(bestPath[0], bestPath[1]);
        } catch (e) {
            const stack = new Error().stack;
            SnakeLogger.error(JSON.stringify(e) + " : " + stack);
            return StateAnalyzer.safeMove();
        }
    }


    async bestPath(): Promise<IPoint[]> {
        let bestIndex;
        let bestScore = 0;
        try {
            await Promise.all (this.endPoints.map( async (endPoint) => { await this.pushPath(endPoint); }));
        } catch (e) {
            const stack = new Error().stack;
            SnakeLogger.error(JSON.stringify(e) + " : " + stack);
        }

        // for (let i = 0; i < this.pathPromises.length; i++) {
        //     try {
        //         const path = await this.pathPromises[i];
        //         SnakeLogger.info("Path " + JSON.stringify(path) + " has been acquired");
        //         this.paths.push(path);
        //     } catch (e) {
        //         const stack = new Error().stack;
        //         SnakeLogger.error(JSON.stringify(e) + " : " + stack);
        //     }
        // }

        const secondMs = new Date().getTime();
        SnakeLogger.info(this.paths.length + " paths have been generated in " + (secondMs - this.startMs) + " milliseconds");

        this.foodPath = this.filterForFoodPath();
        this.agressionPath = this.filterForAgressionPath();
        this.nonAvoidancePath = this.filterForNonAvoidancePath();
        const thirdMs = new Date().getTime();
        for (let i = 0; i < this.paths.length; i++) {
            const score = this.scorePath(this.paths[i]);
            if ( score > bestScore ) {
                bestScore = score;
                bestIndex = i;
            }
        }
        SnakeLogger.info(this.paths.length + " paths have been scored in " + (thirdMs - secondMs) + " milliseconds");
        const bestPath = this.paths[bestIndex];
        SnakeLogger.info("Best path found to be " + JSON.stringify(bestPath));
        return bestPath;
    }

    async pushPath (endPoint: IPoint) {
        try {
            this.paths.push(await this.dodger.getShortestPath(endPoint));
        }  catch (e) {
            const stack = new Error().stack;
            SnakeLogger.error(JSON.stringify(e) + " : " + stack);
        }
    }

    scorePath(path: IPoint[]): number {
        const endPoint = path[path.length - 1];
        const selfProximityFactor = 1 - (path.length / this.stepReferenceScalar);
        const selfProximityTerm = selfProximityFactor * this.selfProximityWeight;

        // The following compares the path to all of the food paths, and generates a factor
        // that is larger the more the path overlaps with any of the food paths
        let foodPathCommonality = 0;
        for (let j = 0; j < Math.min(this.foodPath.length, path.length); j++) {
            if (_.isEqual(path[j], this.foodPath[j])) foodPathCommonality++;
        }

        const foodProximityFactor = (foodPathCommonality / this.stepReferenceScalar);
        const foodProximityTerm = foodProximityFactor * this.foodProximityWeight * (1 + (StateAnalyzer.getMyHunger()) / 33);
        SnakeLogger.info("foodProximityTerm is " +  foodProximityTerm + " for path to " + JSON.stringify(path[path.length - 1]));

        let divideMeByLength: number = 0;
        for (let i = 0; i < path.length; i++) {
            divideMeByLength += StateAnalyzer.getDistanceFromCenter(path[i]);
        }
        const averageDistanceFromCenter = divideMeByLength / path.length;
        const centerProximityFactor = 1 - (averageDistanceFromCenter / this.stepReferenceScalar);
        // const distanceFromCenter = StateAnalyzer.getDistanceFromCenter(path[path.length - 1]);
        // const centerProximityFactor = 1 - (distanceFromCenter / this.stepReferenceScalar);

        const centerProximityTerm = centerProximityFactor * this.centreProximityWeight;
        SnakeLogger.info("centerProximityTerm is " +  centerProximityTerm + " for path to " + JSON.stringify(path[path.length - 1]));

        let agressionPathCommonality = 0;
        for (let j = 0; j < Math.min(this.agressionPath.length, path.length); j++) {
            if (_.isEqual(path[j], this.agressionPath[j])) agressionPathCommonality++;
        }

        const agressionFactor = (agressionPathCommonality / this.stepReferenceScalar);
        const agressionTerm = agressionFactor * this.agressionWeight;
        SnakeLogger.info("agressionTerm is " +  agressionTerm + " for path to " + JSON.stringify(path[path.length - 1]));

        let nonAvoidancePathCommonality = 0;
        for (let j = 0; j < Math.min(this.nonAvoidancePath.length, path.length); j++) {
            if (_.isEqual(path[j], this.nonAvoidancePath[j])) nonAvoidancePathCommonality++;
        }
        const avoidanceFactor = 1 - (nonAvoidancePathCommonality / this.stepReferenceScalar);
        const avoidanceTerm = avoidanceFactor * this.avoidanceWeight;
        SnakeLogger.info("avoidanceTerm is " +  avoidanceTerm + " for path to " + JSON.stringify(path[path.length - 1]));

        // Add a bias?
        const bias = 0;
        const summedScore = selfProximityTerm + foodProximityTerm + centerProximityTerm + agressionTerm + avoidanceTerm;
        SnakeLogger.info("summedScore for path to endPoint " + JSON.stringify(endPoint) + " is " + summedScore);
        return summedScore + bias;

    }


    filterForFoodPath(): IPoint[] {
        SnakeLogger.info("Filtering food paths");
        const foodPoints = StateAnalyzer.getFoodPoints(0);
        const foodPaths = this.paths.filter((path) => {
            const endPoint = path[path.length - 1];
            return getIndexOfValue(foodPoints, endPoint) > -1;
        });
        foodPaths.sort((a, b) => {
            if (a.length < b.length) {
                return -1;
            } else if (a.length > b.length) {
                return 1;
            } else {
                return 0;
            }
        });
        return foodPaths[0];
    }

    filterForAgressionPath(): IPoint[] {
        SnakeLogger.info("Filtering Agression paths");
        const smallerHeadPoints = StateAnalyzer.getSmallerHeadPoints();
        const smallerHeadPaths = this.paths.filter((path) => {
            const endPoint = path[path.length - 1];
            return getIndexOfValue(smallerHeadPoints, endPoint) > -1;
        });
        smallerHeadPaths.sort((a, b) => {
            if (a.length < b.length) {
                return -1;
            } else if (a.length > b.length) {
                return 1;
            } else {
                return 0;
            }
        });
        return smallerHeadPaths[0];
    }

    filterForNonAvoidancePath(): IPoint[] {
        SnakeLogger.info("Filtering Agression paths");
        const largerHeadPoints = StateAnalyzer.getLargerHeadPoints();
        const largerHeadPaths = this.paths.filter((path) => {
            const endPoint = path[path.length - 1];
            return getIndexOfValue(largerHeadPoints, endPoint) > -1;
        });
        largerHeadPaths.sort((a, b) => {
            if (a.length < b.length) {
                return -1;
            } else if (a.length > b.length) {
                return 1;
            } else {
                return 0;
            }
        });
        return largerHeadPaths[0];
    }
};