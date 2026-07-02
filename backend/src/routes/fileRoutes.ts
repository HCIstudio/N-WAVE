import express, { Router } from "express";
import multer from "multer";
import File from "../models/File";

const router: Router = express.Router();

// Use memory storage since files stay in browser
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Route to handle file metadata registration (files stored in browser)
router.post("/register", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      res.status(400).send({ message: "No file metadata provided." });
      return;
    }

    const { originalname, mimetype, size } = req.file;
    const tags = req.body.tags ? req.body.tags.split(",") : [];

    // Generate unique filename for metadata tracking
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const filename = "file-" + uniqueSuffix;

    const newFile = new File({
      originalName: originalname,
      mimetype,
      size,
      filename,
      tags,
    });

    // Detect and set file type
    newFile.detectFileType();

    await newFile.save();

    // Return metadata only (no content)
    res.status(201).send({
      _id: newFile._id,
      filename: newFile.filename,
      originalName: newFile.originalName,
      mimetype: newFile.mimetype,
      size: newFile.size,
      fileType: newFile.fileType,
      tags: newFile.tags,
      createdAt: newFile.createdAt,
    });
  } catch (error) {
    console.error("Error registering file:", error);
    res.status(500).send({ message: "Error registering file.", error });
  }
});

// Route to delete file metadata
router.delete("/:id", async (req, res) => {
  try {
    const fileId = req.params.id;
    const deletedFile = await File.findByIdAndDelete(fileId);

    if (!deletedFile) {
      return res.status(404).send({ message: "File not found." });
    }

    return res
      .status(200)
      .send({ message: "File metadata deleted successfully." });
  } catch (error) {
    console.error("Error deleting file:", error);
    return res.status(500).send({ message: "Error deleting file.", error });
  }
});

export default router;
