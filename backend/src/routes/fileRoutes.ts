import express from "express";
import multer from "multer";
import File from "../models/File";

const router = express.Router() as express.Router;

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

// Route to get all file metadata
router.get("/", async (req, res) => {
  try {
    const searchQuery = req.query.search as string;
    const query = searchQuery
      ? {
          $or: [
            { originalName: { $regex: searchQuery, $options: "i" } },
            { tags: { $regex: searchQuery, $options: "i" } },
            { fileType: { $regex: searchQuery, $options: "i" } },
          ],
        }
      : {};

    const files = await File.find(query)
      .select("-__v") // Exclude version field
      .sort({ createdAt: -1 });

    res.status(200).send(files);
  } catch (error) {
    res.status(500).send({ message: "Error fetching files.", error });
  }
});

// Route to get multiple file metadata by IDs
router.post("/get-many", async (req, res) => {
  try {
    const { fileIds } = req.body;
    if (!fileIds || !Array.isArray(fileIds)) {
      return res.status(400).json({ msg: "File IDs must be an array." });
    }

    const files = await File.find({ _id: { $in: fileIds } }).select("-__v");
    return res.status(200).json(files);
  } catch (error) {
    console.error("Error fetching multiple files:", error);
    return res.status(500).send({ message: "Error fetching files.", error });
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
