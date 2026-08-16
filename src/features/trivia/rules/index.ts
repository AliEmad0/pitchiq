import type { TriviaRule } from "../types";
import { goalExtremesRule } from "./goal-extremes";
import { playerVsCollectiveRule } from "./player-vs-collective";
import { goalRecordRule } from "./goal-record";
import { headToHeadRule } from "./head-to-head";
import { positionRecordRule } from "./position-record";
import { careerGoalsRule } from "./career-goals";
import { lopsidedRule } from "./lopsided";
import { disciplineRule } from "./discipline";
import { symmetricGoalsRule } from "./symmetric-goals";
import { streakRule } from "./streak";
import { opponentSpreadRule } from "./opponent-spread";
import { favouriteOpponentRule } from "./favourite-opponent";
import { multiGoalGamesRule } from "./multi-goal-games";
import { finishingOverperformerRule } from "./finishing-overperformer";
import { creativeArchitectRule } from "./creative-architect";
import { goldenGloveRule } from "./golden-glove";
import { transferImpactRule } from "./transfer-impact";
import { homeFortressRule } from "./home-fortress";
import { failedToScoreRule } from "./failed-to-score";
import { comebackKingsRule } from "./comeback-kings";
import { managerialMerryGoRoundRule } from "./managerial-merry-go-round";
import { yoYoClubRule } from "./yo-yo-club";
import { attendanceExtremesRule } from "./attendance-extremes";
import { survivalThresholdRule } from "./survival-threshold";
import { centurionsRule } from "./centurions";
import { giantKillersRule } from "./giant-killers";
// TASK-M82 — the first rules to read the event stream, the row-level enrichment summary
// and the manager honours map. The facade was blind to all three.
import { lateDecidersRule } from "./late-deciders";
import { favouriteSupplierRule } from "./favourite-supplier";
import { spotKicksAndOwnGoalsRule } from "./spot-kicks-and-own-goals";
import { trophyCabinetRule, internationalDoubleLifeRule } from "./trophy-cabinet";
import { travelledManagerRule } from "./travelled-manager";

/** The full provable-fact rule library (R1-R32). Order is the default surfacing order. */
export const RULES: TriviaRule[] = [
  goalExtremesRule, // R1
  playerVsCollectiveRule, // R2
  goalRecordRule, // R3
  headToHeadRule, // R4
  positionRecordRule, // R5
  careerGoalsRule, // R6
  lopsidedRule, // R7
  disciplineRule, // R8
  symmetricGoalsRule, // R9
  streakRule, // R10
  opponentSpreadRule, // R11
  favouriteOpponentRule, // R12
  multiGoalGamesRule, // R13
  finishingOverperformerRule, // R14
  creativeArchitectRule, // R15
  goldenGloveRule, // R16
  transferImpactRule, // R17
  homeFortressRule, // R18
  failedToScoreRule, // R19
  comebackKingsRule, // R20
  managerialMerryGoRoundRule, // R21
  yoYoClubRule, // R22
  attendanceExtremesRule, // R23
  survivalThresholdRule, // R24
  centurionsRule, // R25
  giantKillersRule, // R26
  // --- TASK-M82 -----------------------------------------------------------
  lateDecidersRule, // R27
  favouriteSupplierRule, // R28
  spotKicksAndOwnGoalsRule, // R29
  trophyCabinetRule, // R30
  internationalDoubleLifeRule, // R31
  travelledManagerRule, // R32
];
