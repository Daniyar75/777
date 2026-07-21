# Роли и права

## 1. Модель

Используется гибрид RBAC + ABAC. RBAC определяет операции над ресурсом, ABAC ограничивает tenant, ownership, ветку, поколение, назначение наставника, чувствительность поля, purpose обработки и состояние объекта. Запрет имеет приоритет над разрешением.

Области: `self`, `owned`, `assigned`, `mentored`, `branch(depth=N)`, `tenant`, `platform`. Экспорт, массовые действия, чтение PII и изменение структуры — отдельные permissions.

## 2. Матрица по умолчанию

Обозначения: R — чтение, C — создание, U — изменение, A — администрирование, S — scoped, — запрет.

| Роль | Contact | Funnel | Orders | Network | Content | Learning | Analytics | Admin |
|---|---|---|---|---|---|---|---|---|
| Platform owner | metadata | — | — | — | global config | — | service metrics | platform A |
| Company admin | CRUD tenant | A | CRUD | A | A | A | tenant R | tenant A |
| Leader | S-RU | S-RU | S-R | branch R | R/use | S-R | branch R | — |
| Mentor | assigned R | assigned RU | assigned R | mentored R | R/use | assigned RU | assigned R | — |
| Partner | owned CRUD | owned CRUD | owned CRUD | self/allowed R | R/use | self RU | self R | — |
| Newcomer | owned limited | owned limited | owned limited | self R | assigned R | self RU | self R | — |
| Client | self R/U | — | self R/confirm | — | public approved | — | — | — |
| Content manager | no PII | — | — | — | CRUD/workflow | linked R | usage R | content config |
| Trainer | assigned minimal | — | — | cohort minimal | training R | CRUD | learning R | learning config |

## 3. Ограничения полей

- телефон, email, адрес, семья, здоровье/ограничения и документы классифицируются как PII/sensitive;
- лидер может видеть маскированные каналы ниже настраиваемой глубины;
- внутренние заметки имеют видимость: private, team, tenant-role;
- Trainer видит только идентификатор, имя и учебный прогресс назначенной аудитории;
- Content manager не получает доступ к Contact для персонализации без отдельного разрешения и purpose;
- Platform support получает временный break-glass доступ только по заявке, с MFA, сроком и аудитом.

## 4. Запрещенные действия

Ни одна роль не может: читать другой tenant без отдельного membership; удалять аудит; физически удалять оплаченный заказ; обходить consent; создавать циклическую структуру; расширять собственные permissions; поручать AI действие, на которое у пользователя нет права.
