# Native Firebase client infrastructure

Provides typed, synchronous development initialization for native App, Auth, Firestore, and Functions modules. Configuration is validated before service access, the native project must be `chorex-dev`, and all services are explicitly routed to emulators. Missing or invalid configuration throws; there is no production fallback.

A process-global registry preserves setup across Fast Refresh. Changing configuration or a partial setup failure requires restarting the development client. No authentication flows, reads, mutations, or domain adapters are implemented.
