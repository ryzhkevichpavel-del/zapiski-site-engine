from __future__ import annotations

import inspect
from types import ModuleType
from typing import Any


class RuntimeCompat:
    def __init__(
        self,
        modules: tuple[ModuleType, ...],
        settings_module: ModuleType,
        state_names: set[str],
    ) -> None:
        self.modules = modules
        self.settings_module = settings_module
        self.state_names = state_names
        self.setting_names = set(getattr(settings_module, "__all__", ()))
        self.exports: dict[str, Any] = {}
        for module in modules:
            for name in getattr(module, "__all__", ()):
                self.exports[name] = getattr(module, name)

    def sync_to_modules(self, namespace: dict[str, Any]) -> None:
        overrides = {name: namespace[name] for name in self.exports if name in namespace}
        setting_overrides = {name: namespace[name] for name in self.setting_names if name in namespace}
        for module in self.modules:
            module.__dict__.update(self.exports)
            module.__dict__.update(setting_overrides)
            module.__dict__.update(overrides)

    def sync_from_modules(self, namespace: dict[str, Any]) -> None:
        for module in self.modules:
            for name in self.state_names:
                if name in module.__dict__:
                    namespace[name] = module.__dict__[name]

    def service_call(self, namespace: dict[str, Any], name: str, *args: Any, **kwargs: Any) -> Any:
        target = namespace.get(name)
        if name in namespace and name not in self.exports:
            return target(*args, **kwargs)
        target = self.exports[name]
        self.sync_to_modules(namespace)
        try:
            return target(*args, **kwargs)
        finally:
            self.sync_from_modules(namespace)

    def proxy(self, namespace: dict[str, Any], name: str) -> Any:
        if name not in self.exports:
            raise AttributeError(name)
        target = self.exports[name]
        if inspect.isfunction(target):
            def _proxy(*args: Any, **kwargs: Any) -> Any:
                return self.service_call(namespace, name, *args, **kwargs)
            _proxy.__name__ = name
            _proxy.__doc__ = target.__doc__
            return _proxy
        return target


__all__ = ["RuntimeCompat"]
