import React, { useEffect, useState } from 'react';
import { ReminderModal } from '@/components/ReminderModal';
import { sendReminderSms, skipReminderTask } from '@/services/reminderService';
import { supabase } from '@/lib/supabase';

interface ReminderTask {
  id: string;
  receipt_id: string;
  milestone: number;
  order_number: string;
  customer_name: string;
  phone: string;
  message: string;
  status: 'pending' | 'sent' | 'failed' | 'skipped';
}

/**
 * ReminderTaskHandler - manages reminder tasks from Supabase realtime
 * and displays the priority modal when a new pending task arrives.
 * 
 * This component should be mounted high in the component tree (e.g., in DashboardPage)
 * to ensure the modal is always visible when needed.
 */
export const ReminderTaskHandler: React.FC = () => {
  const [currentTask, setCurrentTask] = useState<ReminderTask | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Initialize realtime subscription and load pending tasks on mount
  useEffect(() => {
    const initReminderTasks = async () => {
      try {
        // Load first pending task
        const { data: tasks, error } = await supabase
          .from('receipt_reminder_task')
          .select('*')
          .eq('status', 'pending')
          .order('created_at', { ascending: true })
          .limit(1);

        if (error) throw error;

        if (Array.isArray(tasks) && tasks.length > 0) {
          setCurrentTask(tasks[0] as ReminderTask);
        }

        // Subscribe to new pending tasks
        const channel = supabase.channel('reminder-tasks-handler');
        channel.on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'receipt_reminder_task',
          },
          (payload: any) => {
            const newTask = payload.record as ReminderTask;
            // Only process if status is pending
            if (newTask.status === 'pending') {
              // If no current task, show the new one; otherwise queue it
              if (!currentTask || currentTask.status !== 'pending') {
                setCurrentTask(newTask);
              }
            }
          }
        );

        await channel.subscribe();

        return () => {
          channel.unsubscribe();
        };
      } catch (err) {
        console.error('[ReminderTaskHandler] Init error:', err);
      }
    };

    initReminderTasks();
  }, []);

  const handleSendSms = async (taskId: string) => {
    setIsLoading(true);
    try {
      if (!currentTask) return;

      await sendReminderSms({
        taskId,
        phone: currentTask.phone,
        message: currentTask.message,
      });

      // Task status is updated by the service; now load next pending task
      const { data: nextTask, error } = await supabase
        .from('receipt_reminder_task')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(1);

      if (!error && Array.isArray(nextTask) && nextTask.length > 0) {
        setCurrentTask(nextTask[0] as ReminderTask);
      } else if (error) {
        console.error('Error loading next task:', error);
      } else {
        setCurrentTask(null);
      }
    } catch (err) {
      console.error('Error sending SMS:', err);
      // Keep current task visible if error occurs
    } finally {
      setIsLoading(false);
    }
  };

  const handleSkipTask = async (taskId: string) => {
    try {
      await skipReminderTask(taskId);

      // Load next pending task
      const { data: nextTask, error } = await supabase
        .from('receipt_reminder_task')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(1);

      if (!error && Array.isArray(nextTask) && nextTask.length > 0) {
        setCurrentTask(nextTask[0] as ReminderTask);
      } else if (error) {
        console.error('Error loading next task:', error);
      } else {
        setCurrentTask(null);
      }
    } catch (err) {
      console.error('Error skipping task:', err);
      // Keep current task visible if error occurs
    }
  };

  return (
    <ReminderModal
      task={currentTask}
      onSendSms={handleSendSms}
      onSkip={handleSkipTask}
      isLoading={isLoading}
    />
  );
};
