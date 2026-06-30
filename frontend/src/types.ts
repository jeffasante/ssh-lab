export type LabConfig = {
  username: string;
  hostname: string;
  role: string;
  os: string;
  scenario: ScenarioId;
};

export type SSHConfig = {
  host: string;
  port: number;
  username: string;
  password: string;
};

export type AppMode = "lab" | "ssh" | "c2w";

export type ScenarioId =
  | "healthy"
  | "services-down"
  | "high-load"
  | "disk-full";

export const OS_PRESETS: Record<
  string,
  { name: string; pretty: string; kernel: string }
> = {
  ubuntu: {
    name: "ubuntu",
    pretty: "Ubuntu 22.04.3 LTS",
    kernel: "5.15.0-91-generic",
  },
  debian: {
    name: "debian",
    pretty: "Debian GNU/Linux 12 (bookworm)",
    kernel: "6.1.0-21-amd64",
  },
  rhel: {
    name: "rhel",
    pretty: "Red Hat Enterprise Linux 9.4 (Plow)",
    kernel: "5.14.0-427.el9.x86_64",
  },
  alpine: {
    name: "alpine",
    pretty: "Alpine Linux 3.19",
    kernel: "6.6.30-0-virt",
  },
  windows: {
    name: "windows",
    pretty: "Windows Server 2022 Datacenter",
    kernel: "10.0.20348.2655",
  },
};

export const SCENARIOS: {
  id: ScenarioId;
  label: string;
  description: string;
}[] = [
  {
    id: "healthy",
    label: "All services healthy",
    description: "7/7 services running, normal load",
  },
  {
    id: "services-down",
    label: "2 services down",
    description: "nginx + postgresql inactive",
  },
  {
    id: "high-load",
    label: "High load",
    description: "CPU 85–95%, simulated spike",
  },
  {
    id: "disk-full",
    label: "Disk almost full",
    description: "df shows / at 91% used",
  },
];
