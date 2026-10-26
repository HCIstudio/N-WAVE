In about 10 minutes you build a small workflow: it reads a text file, keeps the lines that
contain a word, and shows the result. No Nextflow knowledge is needed.

You need N-WAVE open: the [browser demo](https://hcistudio.github.io/N-WAVE/) to build it, or
your [own installation](https://github.com/HCIstudio/N-WAVE/wiki/Installation) to also run it.
Have any small text file at hand (a `.txt` file of a few lines is enough).

> Prefer to be shown around first? Open **Demo 1 - Text basics** on the home page: its
> tutorial walks through the same parts in seven steps.

## 1. Start a workflow (1 minute)

On the home page, click **New Workflow**, then **Empty workflow**. An empty canvas opens with
the bottom bar below it. Double-click the name *Untitled Workflow* to rename it.

## 2. Add an input (2 minutes)

1. Click **+** (*Add node*) in the top-right corner, and choose **File Input**.
2. On the new node, click **Upload File(s)** and choose your text file.

The node now shows the file's name and size.

![The Add node menu opened with the search "Filter": buttons for the nf-core Library, Custom process and Node packs, and the Filter node under Operators. A File Input node with one file is on the canvas.](https://raw.githubusercontent.com/HCIstudio/N-WAVE/main/.github/assets/wiki/add-node-menu.png)

## 3. Add a step (2 minutes)

1. Click **+** again and choose **Filter**.
2. Double-click the Filter node to open its panel. In **Filter Text**, type a word that
   appears in your file. Leave **Filter Mode** at *Contains*.
3. Close the panel (✕).

![The Filter node's panel with the tabs Settings, Code and Results. Filter Text is "bee" and Filter Mode is Contains.](https://raw.githubusercontent.com/HCIstudio/N-WAVE/main/.github/assets/wiki/filter-panel.png)

**File Selection** can limit the filter to some of the incoming files; with none ticked, it
filters all of them.

## 4. Show the result (1 minute)

Click **+** and choose **Display Output**.

## 5. Connect the nodes (1 minute)

Drag from the dot on the right of **File Input** to the dot on the left of **Filter**, then
from **Filter** to **Display Output**. While you drag, the inputs that fit are ringed green.

The check next to the Run button now says *No problems found*. If it lists a problem, click it:
**Show** moves the canvas to the node it's about.

![File Input, Filter and Display Output connected in a row. The workflow check above the bottom bar says: Nothing to fix, the workflow is ready to run.](https://raw.githubusercontent.com/HCIstudio/N-WAVE/main/.github/assets/wiki/first-workflow.png)

## 6. Run it (2 minutes, installation only)

Click **Run Workflow** (the green ▶ in the bottom bar). The run panel opens and shows each
step; the first run takes longer because N-WAVE downloads Nextflow. When it says
*Workflow Complete*, double-click **Display Output**: it shows the lines that contain your word.

The browser demo can't run workflows (a run there stops with a notice). Click **Export
Project** instead to download the workflow as a project you can run anywhere with Nextflow.

## 7. Look behind the scenes (1 minute)

Double-click **Filter** and open its **Code** tab: this is the Nextflow the node adds. The
whole script is what **Download Workflow** saves. Your workflow is saved automatically.

## Next

- [Building workflows](https://github.com/HCIstudio/N-WAVE/wiki/Building-Workflows): connecting,
  checking, copying and shortcuts.
- [Node reference](https://github.com/HCIstudio/N-WAVE/wiki/Nodes): what every node does.
- [nf-core library](https://github.com/HCIstudio/N-WAVE/wiki/nf-core-Library): real
  bioinformatics tools, or start from the **QC of FASTQ files** template.
- Unknown terms: the **Help** page in N-WAVE (home page → Help, the canvas's **?** button, or
  the ⓘ buttons).
