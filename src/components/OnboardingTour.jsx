import React, { useState, useEffect, useLayoutEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import { useLanguage } from '../contexts/LanguageContext';

const OnboardingTour = () => {
  const { t } = useLanguage();
  const [step, setStep] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const [targetRect, setTargetRect] = useState(null);

  useEffect(() => {
    // Check if user has seen the tour
    const hasSeen = localStorage.getItem('onboarding_seen');
    // Check if device is mobile (width < 768px)
    const isMobile = window.innerWidth < 768;

    if (!hasSeen && !isMobile) {
      // Small delay to ensure UI is ready
      const timer = setTimeout(() => setIsVisible(true), 1000);
      return () => clearTimeout(timer);
    }
  }, []);

  const steps = useMemo(() => ([
    {
      targetId: 'quick-issue-btn',
      title: t('onboardingtour.quickIssue.title') || 'Szybkie wydanie narzędzi',
      content: t('onboardingtour.quickIssue.content') || 'Tutaj możesz szybko wydać narzędzie pracownikowi skanując kod QR lub wpisując nazwę, kod ręcznie.',
    },
    {
      targetId: 'quick-return-btn',
      title: t('onboardingtour.quickReturn.title') || 'Szybki zwrot narzędzi',
      content: t('onboardingtour.quickReturn.content') || 'W tym miejscu możesz szybko przyjąć zwrot narzędzia od pracownika, skanując kod lub wybierając z listy.',
    },
    {
      targetId: 'search',
      title: t('onboardingtour.search.title') || 'Wyszukiwarka',
      content: t('onboardingtour.search.content') || 'Wpisz frazę lub użyj skrótu Ctrl+K, aby błyskawicznie przeszukać zasoby systemu, narzędzia i pracowników.',
    },
    {
      targetId: 'main-sidebar',
      title: t('onboardingtour.navigation.title') || 'Nawigacja',
      content: t('onboardingtour.navigation.content') || 'Pasek boczny umożliwia szybki dostęp do wszystkich modułów systemu: Narzędzia, Pracownicy, Raporty, BHP i Ustawienia.',
    },
    {
      targetId: 'help-trigger-btn',
      title: t('onboardingtour.help.title') || 'Centrum Pomocy',
      content: t('onboardingtour.help.content') || 'Kliknij ikonę znaku zapytania, aby otworzyć panel pomocy z przewodnikami i odpowiedziami na częste pytania.',
    }
  ]), [t]);

  // Auto-scroll to target element when step changes
  useEffect(() => {
    if (isVisible && steps[step]) {
      const element = document.getElementById(steps[step].targetId);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
      }
    }
  }, [step, isVisible, steps]);

  useLayoutEffect(() => {
    if (!isVisible) return;
    
    const updatePosition = () => {
      const currentStep = steps[step];
      if (!currentStep) return;

      const element = document.getElementById(currentStep.targetId);
      if (element) {
        const rect = element.getBoundingClientRect();
        setTargetRect({
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
          bottom: rect.bottom,
          right: rect.right
        });
      }
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isVisible, step, steps]);

  const handleNext = () => {
    if (step < steps.length - 1) {
      setStep(step + 1);
    } else {
      handleClose();
    }
  };

  const handlePrev = () => {
    if (step > 0) {
      setStep(step - 1);
    }
  };

  const handleClose = () => {
    setIsVisible(false);
    localStorage.setItem('onboarding_seen', 'true');
  };

  if (!isVisible || !targetRect) return null;

  const currentStep = steps[step];
  
  // Smart positioning logic
  const isRightSide = targetRect.left > window.innerWidth / 2;
  // If element is in the bottom half OR if there's not enough space below (less than 250px)
  const isBottomHalf = targetRect.top > window.innerHeight / 2 || (window.innerHeight - targetRect.bottom) < 250;
  // Special case for sidebar/tall elements on the left
  const isLeftSideBar = targetRect.left < 50 && targetRect.height > window.innerHeight * 0.5;

  const arrowSize = 10;
  let tooltipStyle = {};
  let arrowStyle = {
    position: 'absolute',
    width: 0,
    height: 0,
    borderStyle: 'solid',
    borderWidth: arrowSize,
    borderColor: 'transparent',
    zIndex: 20
  };
  let arrowClasses = "absolute w-0 h-0 border-solid";

  if (isLeftSideBar) {
    tooltipStyle = {
      top: targetRect.top + 100,
      left: targetRect.right + 20,
      transform: 'none'
    };
    
    // Arrow points LEFT (attached to Left side of tooltip)
    // Actually, if tooltip is to the RIGHT of target, arrow should point LEFT.
    // The colored side is the RIGHT border (flat side on right, point on left).
    // Wait. border-right colored => Triangle points LEFT.
    arrowClasses += " border-r-white dark:border-r-gray-800 border-y-transparent border-l-0";
    arrowStyle.top = 20;
    arrowStyle.left = -arrowSize; // Stick out left
    arrowStyle.transform = 'none';
  } else {
    tooltipStyle = {
      top: isBottomHalf ? 'auto' : targetRect.bottom + 45,
      bottom: isBottomHalf ? (window.innerHeight - targetRect.top + 20) : 'auto',
      left: isRightSide ? 'auto' : targetRect.left + (targetRect.width / 2),
      right: isRightSide ? 20 : 'auto',
      transform: isRightSide ? 'none' : 'translateX(-50%)'
    };

    if (isBottomHalf) {
      // Tooltip ABOVE target. Arrow points DOWN.
      // Colored side is TOP.
      arrowClasses += " border-t-white dark:border-t-gray-800 border-x-transparent border-b-0";
      arrowStyle.bottom = -arrowSize;
      
      if (isRightSide) {
        arrowStyle.right = (window.innerWidth - (targetRect.left + targetRect.width / 2)) - 20 - arrowSize;
        arrowStyle.left = 'auto';
      } else {
        arrowStyle.left = '50%';
        arrowStyle.transform = 'translateX(-50%)';
      }
    } else {
      // Tooltip BELOW target. Arrow points UP.
      // Colored side is BOTTOM.
      arrowClasses += " border-b-white dark:border-b-gray-800 border-x-transparent border-t-0";
      arrowStyle.top = -arrowSize;
      
      if (isRightSide) {
        arrowStyle.right = (window.innerWidth - (targetRect.left + targetRect.width / 2)) - 20 - arrowSize;
        arrowStyle.left = 'auto';
      } else {
        arrowStyle.left = '50%';
        arrowStyle.transform = 'translateX(-50%)';
      }
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[100]">
      {/* Overlay with cutout/highlight logic could be complex. 
          Simple approach: Dark overlay with a transparent hole or just a highlighted border on top.
          The snippet used: absolute w-96 h-20 border-2 border-yellow-500 rounded-lg
      */}
      <div className="absolute inset-0 bg-black/50 transition-colors duration-500" />
      
      {/* Spotlight / Highlight Frame */}
      <div 
        className="absolute border-2 border-yellow-400 rounded-2xl shadow-[0_0_0_9999px_rgba(0,0,0,0.5)] transition-all duration-300 ease-in-out pointer-events-none"
        style={{
          top: targetRect.top - 4,
          left: targetRect.left - 4,
          width: targetRect.width + 8,
          height: targetRect.height + 8,
        }}
      />

      {/* Tooltip */}
      <div 
        className="absolute filter drop-shadow-2xl transition-all duration-300 z-[101] max-w-sm"
        style={tooltipStyle}
      >
        {/* Arrow */}
        <div 
          className={arrowClasses}
          style={arrowStyle}
        />
        
        {/* Content */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 relative">
          <h4 className="font-semibold mb-2 text-gray-900 dark:text-white relative z-10">{currentStep.title}</h4>
          <p className="text-sm text-gray-600 dark:text-gray-300 mb-4 relative z-10">
            {currentStep.content}
          </p>
          
          <div className="flex items-center justify-between mt-4 relative z-10">
            <button 
              onClick={handleClose}
              className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
            >
              {t('onboardingtour.skip') || 'Pomiń'}
            </button>
            
            <div className="flex gap-2">
              {step > 0 && (
                <button 
                  onClick={handlePrev}
                  className="p-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
                  aria-label={t('onboardingtour.prevStep') || 'Poprzedni krok'}
                >
                  <ChevronLeftIcon className="w-5 h-5" />
                </button>
              )}
              
              <button 
                onClick={handleNext}
                className="p-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full transition-colors shadow-sm flex items-center justify-center"
                aria-label={step === steps.length - 1 ? (t('onboardingtour.finish') || 'Zakończ') : (t('onboardingtour.nextStep') || 'Następny krok')}
              >
                <ChevronRightIcon className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default OnboardingTour;
