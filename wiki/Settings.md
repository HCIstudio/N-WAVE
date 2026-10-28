The **Settings** button on the home page, next to **Import Workflow**, opens the settings for
all of N-WAVE. A workflow can still set its own limits and run profile in its
[execution settings](https://github.com/HCIstudio/N-WAVE/wiki/Running-Workflows#execution-settings).

## Notifications

N-WAVE can send browser notifications while you're in another tab or window:

- a run **finished** (with how long it took),
- a run **failed or was stopped** (with the reason, as the run panel explains it),
- N-WAVE **can't be reached** any more, and again when it's **back**.

Turn on **Send browser notifications**; the browser asks for permission then (not before).
Choose which events to be told about, and use **Send test notification** to check that they
show up. If nothing shows up, check your system's notification settings (Focus, Do Not
Disturb). Clicking a run's notification opens its workflow with the run panel.

Notifications only come while the N-WAVE tab isn't in view; when it is, the page shows the
same itself. With several N-WAVE tabs open, each event is notified once. The choices are kept
in this browser.

Browsers allow notifications only for pages on HTTPS or on this computer (`localhost`). When
N-WAVE is opened over plain HTTP from another machine, the page says so; open it at
`http://localhost` or put it behind HTTPS. If the browser blocks N-WAVE's notifications,
allow them in the site settings (the icon left of the address) and reload the page.

## Run limits

**Maximum CPU Cores**, **Maximum Memory** and **Execution Timeout** for every workflow that
doesn't set its own (*Execution Settings → Resources → Use the run defaults*). The page shows
what the server allows: higher values are lowered to `NWAVE_MAX_CPUS` and `NWAVE_MAX_MEMORY`,
and a timeout of 0 uses `NWAVE_EXECUTION_TIMEOUT` (24 hours unless set). Each step may run as
long as the run.

## Resume

When **Resume** starts out on by the Run button: after a failed or stopped run (the default),
whenever earlier runs left a cache, or never. The switch can always be changed before a run.

## Run profiles

The [run profiles](https://github.com/HCIstudio/N-WAVE/wiki/Run-Profiles) and the one runs use
by default. A workflow can choose another profile, or this computer, in
*Execution Settings → Profiles*. Workflows from before this page keep running on this computer
until you choose otherwise.

Click **Save run defaults** to apply changes. The run limits, Resume and profiles are kept by
N-WAVE (in `settings.json` in its data folder), so every browser uses the same.

## Run cache

How much space the run cache of all workflows takes, and **Clear all caches**. Folders of runs
that are still going are left alone. Results, inputs and logs stay. A single workflow's cache
is in its execution settings.
