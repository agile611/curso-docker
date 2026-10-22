(function () {
  "use strict";

  const modules = [
    {
      path: "guia-del-curso",
      title: "Guía del curso"
    },
    {
      path: "dia-01-fundamentos",
      title: "1 · Fundamentos"
    },
    {
      path: "dia-02-tecnicas",
      title: "2 · Técnicas y formatos"
    },
    {
      path: "dia-03-evaluacion-y-seguridad",
      title: "3 · Evaluación y seguridad"
    },
    {
      path: "dia-04-aplicaciones",
      title: "4 · Aplicaciones profesionales"
    },
    {
      path: "dia-05-proyecto",
      title: "5 · Proyecto e integración"
    },
    {
      path: "proyecto-final",
      title: "Proyecto final"
    },
    {
      path: "plantillas",
      title: "Plantillas de trabajo"
    },
    {
      path: "evaluacion",
      title: "Evaluación del curso"
    },
    {
      path: "recursos",
      title: "Recursos y referencias"
    }
  ];

  const defaultTitle = "Curso de Prompt Engineering";

  function getModuleTitle() {
    /*
     * Comparamos segmentos completos de la URL.
     * También funciona si la web se publica en una subcarpeta,
     * como ocurre habitualmente en GitHub Pages.
     */
    const pathSegments = window.location.pathname
      .split("/")
      .filter(Boolean);

    const selectedModule = modules.find(function (module) {
      return pathSegments.includes(module.path);
    });

    return selectedModule ? selectedModule.title : defaultTitle;
  }

  function updateSidebarTitle() {
    /*
     * Seleccionamos el título de la navegación principal,
     * no los títulos de sus subsecciones.
     */
    const sidebarTitle = document.querySelector(
      ".md-sidebar--primary .md-nav--primary > .md-nav__title"
    );

    if (!sidebarTitle) {
      return;
    }

    const title = getModuleTitle();

    /*
     * Actualizamos solo el texto directo del título.
     * Así conservamos el logotipo, los enlaces y los iconos
     * que Material pueda incluir dentro del elemento.
     */
    const textNodes = Array.from(sidebarTitle.childNodes).filter(
      function (node) {
        return (
          node.nodeType === Node.TEXT_NODE &&
          node.textContent.trim() !== ""
        );
      }
    );

    if (textNodes.length > 0) {
      textNodes[0].textContent = "\n" + title + "\n";

      // Evitamos mantener texto adicional de un título anterior.
      textNodes.slice(1).forEach(function (node) {
        node.textContent = "";
      });
    } else {
      sidebarTitle.appendChild(
        document.createTextNode("\n" + title + "\n")
      );
    }
  }

  function initialize() {
    updateSidebarTitle();

    /*
     * Material puede actualizar la navegación después
     * de cargar el contenido.
     */
    window.setTimeout(updateSidebarTitle, 100);
    window.setTimeout(updateSidebarTitle, 500);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, {
      once: true
    });
  } else {
    initialize();
  }

  /*
   * Compatible con navigation.instant de Material.
   * document$ se emite cuando se carga una nueva página.
   */
  if (
    typeof document$ !== "undefined" &&
    typeof document$.subscribe === "function"
  ) {
    document$.subscribe(function () {
      initialize();
    });
  }
})();