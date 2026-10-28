A run profile says where a workflow's steps run: on **this computer**, on a **SLURM
cluster** or on **AWS Batch**. It also sets the container engine and default resources.
Profiles are kept in [Global Settings](https://github.com/HCIstudio/N-WAVE/wiki/Settings),
for every workflow.

## Making a profile

Open **Global Settings** on the home page and, under **Run profiles**, click **SLURM cluster
profile**, **AWS Batch profile** or **Local profile**. Click **Save global settings** when done. Each starts from sensible values; change them in its card:

| Setting | Meaning |
| --- | --- |
| Name | The Nextflow profile name, used as `-profile <name>`. Letters, digits and `_`; not `docker`, which every project already has. |
| Runs steps on | This computer, SLURM cluster or AWS Batch. |
| Partition (queue) / Job queue | The SLURM partition, or the AWS Batch job queue. Empty means the cluster's default partition. |
| Containers | Docker, Singularity, Apptainer, or none (the tools must be installed where steps run). Clusters usually offer Singularity or Apptainer. |
| CPUs, memory, time per step | Defaults for steps that don't set their own. On SLURM, the time must fit the partition's limit. |
| Jobs at once | How many jobs Nextflow keeps queued. |
| Extra sbatch options | SLURM only, for example `--account=lab`. |
| AWS region, S3 work directory | AWS Batch only, for example `eu-west-1` and `s3://my-bucket/work`. |

Problems with a profile show in its card; a profile with problems is left out of exports
and can't be chosen for runs.

## Using a profile

- **In an exported project** (every kind of profile): every profile goes into its
  `nextflow.config`, and its README lists them. Run with
  `nextflow run main.nf -profile slurm`. A project with an nf-core Pipeline node gets them in
  `profiles.config` instead:
  `nextflow run nf-core/<pipeline> … -profile test,slurm -c profiles.config`. See
  [Exporting projects](https://github.com/HCIstudio/N-WAVE/wiki/Exporting-Projects).
- **For runs from N-WAVE** (local and SLURM profiles): choose the profile all workflows use
  under **Runs use by default** in Global Settings. For a single workflow, turn off
  **Use the global run profile** in its *Execution Settings → Profiles* and choose another. The Run button's tooltip and the run's first lines name it.
  *This computer* uses the other execution settings.

Workflows made before profiles moved to Global Settings may still keep profiles of their own; they can
still be used, and *Execution Settings → Profiles* offers **Move to Global Settings**.

## Running on SLURM from N-WAVE

N-WAVE submits each step with `sbatch`, so its backend has to run where jobs can be
submitted, such as a login node:

- Run N-WAVE [from source](https://github.com/HCIstudio/N-WAVE#from-source) with Nextflow
  installed and `NEXTFLOW_EXECUTION_MODE=local`, with `sbatch` on the `PATH`.
- Keep the output directory on storage the compute nodes share: each step runs as a job in the
  run's `nextflow/work` folder.

The Docker installation runs Nextflow in a container that can't reach a scheduler; a SLURM
run there stops and says so. Export the project and run it on the cluster instead.

**Cancel** also cancels the run's SLURM jobs, and the run panel shows the steps as usual. The
server's resource limits still cap each step.

AWS Batch profiles are for exported projects only: N-WAVE doesn't run them itself yet. A run
needs AWS credentials where Nextflow runs, and the AWS CLI in the queue's compute environment
(see [Nextflow's AWS Batch guide](https://www.nextflow.io/docs/latest/aws.html)).

## See also

- [Troubleshooting: SLURM jobs wait forever](https://github.com/HCIstudio/N-WAVE/wiki/Troubleshooting#slurm-jobs-wait-forever)
- [Nextflow executors](https://www.nextflow.io/docs/latest/executor.html) and
  [container engines](https://www.nextflow.io/docs/latest/container.html)
