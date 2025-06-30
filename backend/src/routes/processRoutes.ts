import express from "express";
import File from "../models/File";

const router = express.Router() as express.Router;

// @route   POST api/process/filter
// @desc    Filter content provided from frontend (files stored in browser)
// @access  Public
router.post("/filter", async (req, res) => {
  const {
    fileIds,
    fileContents, // Content now comes from frontend
    filterText,
    filterMode = "contains",
    filterNegate = false,
  } = req.body;

  if (!fileIds || !Array.isArray(fileIds) || !filterText) {
    return res
      .status(400)
      .json({ msg: "Please provide fileIds and filterText." });
  }

  if (!fileContents || !Array.isArray(fileContents)) {
    return res
      .status(400)
      .json({ msg: "Please provide fileContents array from frontend." });
  }

  try {
    // Verify file metadata exists (optional - for validation)
    const files = await File.find({ _id: { $in: fileIds } });
    if (files.length !== fileIds.length) {
      return res
        .status(404)
        .json({ msg: "One or more files not found in metadata." });
    }

    // Process content provided from frontend
    let combinedContent = "";
    fileContents.forEach((content) => {
      combinedContent += content + "\n";
    });

    const lines = combinedContent.split("\n");
    let regex;
    switch (filterMode) {
      case "startsWith":
        regex = new RegExp(`^${filterText}`, "i");
        break;
      case "endsWith":
        regex = new RegExp(`${filterText}$`, "i");
        break;
      case "matches":
        try {
          regex = new RegExp(filterText, "i");
        } catch (e) {
          return res.status(400).json({ msg: "Invalid regular expression." });
        }
        break;
      case "contains":
      default:
        regex = new RegExp(filterText, "i");
        break;
    }

    const filteredLines = lines.filter((line) => {
      const match = regex.test(line);
      return filterNegate ? !match : match;
    });

    return res.json({
      filteredContent: filteredLines.join("\n"),
      filteredCount: filteredLines.length,
      totalLines: lines.length,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).send("Server Error");
  }
});

export default router;
