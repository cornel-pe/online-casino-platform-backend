import { Request, Response } from 'express';
import User, { IUser } from '../models/User';
import { broadcast } from '../websocket';
import { CrashGame, ICrash, ICrashPlayer } from '../models/Crash';

interface AuthRequest extends Request {
  user?: IUser;
}

class GameController {
  async getCrashGame(req: AuthRequest, res: Response): Promise<Response> {
    try {
      const crashGame = await CrashGame.findOne({ status: { $in: ["PENDING", "STARTED"] } })
        .sort({ createdAt: -1 })
        .populate("players.user", "username avatar level"); // ✅ populate nested `user`

      if (!crashGame) {
        return res.json({ message: "No active crash game found" });
      }

      return res.json({
        type: "success",
        game: crashGame,
      });
    } catch (error) {
      console.error("Get crash game error:", error);
      return res.status(500).json({ error: "Failed to fetch crash game" });
    }
  }

  async JoinGame(req: AuthRequest, res: Response): Promise<Response> {
  try {
    if (req.body.game === "crash") {
      let crashgame = await CrashGame.findOne({ status: { $in: ["PENDING", "STARTED"] } })
        .sort({ createdAt: -1 })
        .populate("players.user", "username avatar level"); // 👈 populate user inside subdocument

      // If no crash game exists → create one
      if (!crashgame) {
        crashgame = new CrashGame({
          round: 1,
          ticket: 0,
          status: "PENDING",
          players: [{ user: req.user._id, status: "PENDING" }], // 👈 must be object
        });
        await crashgame.save();
        crashgame = await CrashGame.findById(crashgame._id)
          .populate("players.user", "username avatar level");
      } else {
        // Check if already joined
        const alreadyJoined = crashgame.players.some(
          (p: any) => p.user.toString() === req.user._id.toString()
        );
        if (alreadyJoined) {
          return res.json({
            type: "default",
            message: "Already joined this crash game",
            game: crashgame,
          });
        }

        // Add new player correctly
        crashgame.players.push({ user: req.user._id, status: "PENDING" } as ICrashPlayer);
        await crashgame.save();
        await crashgame.populate("players.user", "username avatar level");
      }

      // Broadcast join event
      const newUser = await User.findById(req.user._id).select("username avatar level");
      broadcast({
        type: "game",
        data: { category: "crash", action: "join", user: newUser },
      });

      // Start game if >1 players
      if (crashgame.players.length > 1 && crashgame.status === "betting") {
        crashgame.status = "running";
        await crashgame.save();
        broadcast({
          type: "game",
          data: { category: "crash", action: "start", game: crashgame },
        });
      }

      return res.json({
        type: "success",
        message: "Joined crash game successfully",
        game: crashgame,
      });
    }
  } catch (error) {
    console.error("Join game error:", error);
    return res.status(500).json({ error: "Failed to join game" });
  }
}

}

export default new GameController(); 