# Part 5 — Diseño Conceptual: Agente de IA para Gestión de Campañas

## Arquitectura

El sistema se compone de cuatro capas: **LLM (cerebro)**, **Tools (manos)**, **Base de datos (memoria)**, y **Audit Log (registro)**.

El agente opera en un **loop de razonamiento** (ReAct pattern): recibe un trigger (cron o evento), consulta métricas de la base de datos mediante una tool `query_campaigns`, y el LLM decide — con base en los datos y reglas de negocio inyectadas en el system prompt — si debe actuar. Las acciones disponibles se exponen como **tools con function calling**: `pause_campaign`, `send_alert`, `adjust_budget`. El LLM no ejecuta código arbitrario; solo puede invocar tools predefinidas con parámetros tipados.

La diferencia clave entre un agente y un script es el **razonamiento contextual**: un script aplica reglas fijas (if ROAS < 1 → pause), mientras que el agente puede correlacionar múltiples señales — ROAS bajo + alto spend + tendencia descendente — y decidir una acción más matizada como reducir presupuesto antes de pausar.

**Auditabilidad**: cada ciclo del loop se persiste en una tabla `agent_decisions` con: timestamp, input data, razonamiento del LLM (chain of thought), tool invocada, parámetros, y resultado. Esto permite auditoría post-mortem y rollback. Un **human-in-the-loop gate** puede configurarse para acciones destructivas (pausar campañas), requiriendo aprobación vía Slack antes de ejecutar.

```
┌─────────────┐     ┌─────────────┐     ┌──────────────┐
│  Cron/Event  │────▶│  Agent Loop │────▶│  Tool: Query │──▶ DB
│   Trigger    │     │   (LLM)     │     │  Tool: Pause │──▶ Ads API
└─────────────┘     │             │     │  Tool: Alert │──▶ Slack
                    │  Decide +   │     └──────────────┘
                    │  Reason     │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │ Audit Log   │
                    │ (decisions) │
                    └─────────────┘
```
